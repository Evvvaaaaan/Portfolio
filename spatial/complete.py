"""Free local SDXL inpainting + depth-aligned surfaces across a 180-degree arc.

This is generative completion, not reconstruction of measured hidden geometry.
Weights are installed separately; all inference runs offline on the local device.
"""
import gc
import json
import os
from pathlib import Path
import subprocess
import sys
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path(os.environ.get('SPATIAL_RUNTIME', ROOT / '.spatial-runtime'))
sys.path.insert(0, str(RUNTIME / 'vendor/Depth-Anything-3-main/src'))


def run(job):
    import numpy as np
    import torch
    from PIL import Image
    from diffusers import AutoPipelineForInpainting
    from depth_anything_3.api import DepthAnything3
    from completion_geometry import align_depth, lift_patch
    from reconstruct import write_json

    request = json.loads((job / 'request.json').read_text())
    metadata = json.loads((job / 'scene.json').read_text())
    original = np.load(job / 'reconstruction.npz')
    started = time.monotonic()
    initial_elapsed = json.loads((job / 'status.json').read_text()).get('elapsed', 0)
    device = metadata['device']
    torch.set_num_threads(min(6, os.cpu_count() or 4))
    dtype = torch.float32 if device == 'cpu' else torch.float16
    pipe = AutoPipelineForInpainting.from_pretrained(RUNTIME / 'models-inpaint',
        torch_dtype=dtype, variant='fp16', local_files_only=True)
    pipe.enable_attention_slicing()
    pipe.vae.enable_slicing()
    angles = [-30, -60, -90, 30, 60, 90]
    width, height = (784, 560) if request['quality'] == 'detail' else (672, 448)
    cameras, triangles = [], 0
    prompt = ('A photorealistic continuation of the same space and existing surfaces, '
              'consistent architecture and perspective, matching materials and lighting, '
              'natural continuous walls and floor, realistic photograph')

    for index, angle in enumerate(angles):
        state = json.loads((job / 'status.json').read_text())
        if state['stage'] == 'cancelled':
            return
        state.update(stage='completing', progress=76 + round(index / len(angles) * 17),
                     completionStep=index + 1, completionTotal=len(angles),
                     elapsed=initial_elapsed + round(time.monotonic() - started))
        write_json(job / 'status.json', state)
        subprocess.run([sys.executable, str(ROOT / 'spatial/render_completion.py'), str(job),
                        str(index), str(angle), str(width), str(height)], check=True, timeout=120)
        projection = np.load(job / f'generated-render-{index}.npz')
        image = Image.open(job / f'generated-input-{index}.png').convert('RGB')
        mask = Image.open(job / f'generated-mask-{index}.png').convert('L')
        pipe.to(device)
        result = pipe(prompt=prompt,
            negative_prompt='illustration, cartoon, floating objects, duplicated furniture, text, watermark, broken surfaces',
            image=image, mask_image=mask, width=width, height=height,
            num_inference_steps=24 if request['quality'] == 'detail' else 18,
            guidance_scale=5., strength=.99,
            generator=torch.Generator(device='cpu').manual_seed(719 + index)).images[0]
        # Diffusion may alter unmasked pixels. Composite only the requested region.
        result = Image.composite(result, image, mask)
        result.save(job / f'generated-{index}.jpg', quality=96)
        # Keep half-precision weights in system memory; never execute them on CPU.
        if device != 'cpu':
            for component in pipe.components.values():
                if isinstance(component, torch.nn.Module):
                    component.to('cpu')
        gc.collect()
        if device == 'mps':
            torch.mps.empty_cache()
        elif device == 'cuda':
            torch.cuda.empty_cache()
        depth_model = DepthAnything3.from_pretrained(str(RUNTIME / 'models-metric')).to(device).eval()
        prediction = depth_model.inference([result], process_res=width)
        predicted = prediction.depth[0].astype(np.float32)
        if predicted.shape != (height, width):
            raise ValueError('보완 깊이의 카메라 해상도가 일치하지 않습니다.')
        depth = align_depth(predicted, projection['depth'], projection['mask'])
        patch = lift_patch(depth, projection['mask'], projection['intrinsic'], projection['pose'], original)
        np.savez_compressed(job / f'generated-surface-{index}.npz', **patch)
        triangles += len(patch['faces'])
        camera = json.loads((job / f'generated-camera-{index}.json').read_text())
        camera['image'] = f'generated-{index}.jpg'
        cameras.append(camera)
        del depth_model, prediction
        gc.collect()
        if device == 'mps':
            torch.mps.empty_cache()
        elif device == 'cuda':
            torch.cuda.empty_cache()
        print(f'LOCAL_COMPLETION {index + 1}/6: {angle} degrees, {len(patch["faces"])} new triangles', flush=True)
    if triangles < 1000:
        raise ValueError('보완 표면을 충분히 연결하지 못했습니다. 다른 시점의 사진을 추가해 주세요.')
    metadata['completion'] = dict(status='ready', engine='SDXL Inpainting 0.1 + DA3METRIC-LARGE',
        local=True, apiCost=0, license='CreativeML Open RAIL++-M', horizontalRange=180,
        cameras=cameras, triangles=triangles, viewCount=len(cameras),
        warning='실험적 AI 추정입니다. 실제 뒷면과 다르며, 특히 ±90°에서는 표면이 늘어나거나 빈틈이 남을 수 있습니다.')
    write_json(job / 'scene.json', metadata)
    print(f'LOCAL_COMPLETION_OK: {triangles} generated triangles', flush=True)


if __name__ == '__main__':
    run(Path(sys.argv[1]).resolve())
