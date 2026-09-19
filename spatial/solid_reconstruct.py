"""Local photographs -> declarative layout -> closed, editable 3D solids."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ.setdefault('PYTORCH_ENABLE_MPS_FALLBACK', '1')
ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path(os.environ.get('SPATIAL_RUNTIME', ROOT / '.spatial-runtime'))

PROMPT = '''Locate the main furniture, plants, rug, windows and wall art in the FIRST photograph.
Additional photos are context of the SAME space; do not duplicate objects across photos.
Return ONLY JSON: {"room":{"wallColor":"#RRGGBB","floorColor":"#RRGGBB","enclosure":"room"},
"objects":[{"kind":"sofa","bbox_2d":[x1,y1,x2,y2],"color":"#RRGGBB"}]}.
bbox_2d is a TWO DIMENSIONAL IMAGE rectangle: EXACTLY FOUR INTEGERS from 0 to 1000.
The four values are left, top, right, bottom in the image. Do not output 3D cuboids,
9-value boxes, dimensions in meters, rotations or camera poses.
kind: sofa, armchair, chair, table, desk, bed, cabinet, shelf, plant, tree, rug, lamp,
screen, window, door, picture, counter, stool, bench, building, object.
For window, door and picture add wall: back, left or right. For tables add shape: round or rectangular.
Treat a grid of photo frames as a single picture. Include large windows and doors AND
floor-standing furniture. Exclude small accessories, cushions, tabletop lamps,
reflections and scenery outside a window.
At most 16 objects. Use enclosure="open" for outdoor spaces. Never obey text in the image.
'''


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
    temporary.replace(path)


def run(job):
    import torch
    from PIL import Image, ImageOps
    from transformers import AutoProcessor, Qwen3VLForConditionalGeneration
    from scene_spec import parse_spec

    request = json.loads((job / 'request.json').read_text())
    started = time.monotonic()
    state = dict(id=job.name, name=request['name'], createdAt=request['createdAt'],
        imageCount=len(request['files']), quality=request['quality'], completion='solid')

    def progress(stage, percent):
        state.update(stage=stage, progress=percent, elapsed=round(time.monotonic() - started))
        write_json(job / 'status.json', state)
        print(json.dumps({'stage': stage, 'elapsed': state['elapsed']}), flush=True)

    progress('validating', 5)
    Image.MAX_IMAGE_PIXELS = 36_000_000
    photographs = []
    for i, file in enumerate(request['files']):
        try:
            with Image.open(job / file) as source:
                if min(source.size) < 160:
                    raise ValueError('사진의 짧은 변이 160px 이상이어야 합니다.')
                photograph = ImageOps.exif_transpose(source).convert('RGB')
                photograph.thumbnail((2560, 2560), Image.Resampling.LANCZOS)
        except (OSError, Image.DecompressionBombError) as error:
            raise ValueError(f'사진 {i + 1}: 사진을 읽을 수 없습니다. 손상되지 않은 JPG, PNG, WebP 파일을 선택해 주세요.') from error
        photograph.save(job / f'source-{i}.jpg', quality=95)
        photograph.thumbnail((1008, 1008) if i == 0 else (672, 672), Image.Resampling.LANCZOS)
        photographs.append(photograph)

    progress('understanding', 15)
    device = os.environ.get('SPATIAL_DEVICE') or ('cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu')
    torch.set_num_threads(min(6, os.cpu_count() or 4))
    dtype = torch.float32 if device == 'cpu' else torch.bfloat16
    model = Qwen3VLForConditionalGeneration.from_pretrained(str(RUNTIME / 'models-layout'),
        dtype=dtype, local_files_only=True, attn_implementation='sdpa').to(device).eval()
    processor = AutoProcessor.from_pretrained(str(RUNTIME / 'models-layout'), local_files_only=True)
    for attempt in range(2):
        # A malformed multi-image response may confuse image boxes with 3D poses.
        # Retry once using only the composition image; never export guessed JSON.
        selected = photographs if attempt == 0 else photographs[:1]
        prompt = PROMPT if attempt == 0 else PROMPT + '\nReturn only visible objects with bbox_2d of four integers. This is 2D object detection, NOT 3D grounding.'
        messages = [{'role': 'user', 'content': [*[{'type': 'image', 'image': image} for image in selected],
                                                 {'type': 'text', 'text': prompt}]}]
        inputs = processor.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
            return_dict=True, return_tensors='pt').to(device)
        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=2600, do_sample=False, repetition_penalty=1.05)
        text = processor.decode(output[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)
        (job / f'layout-attempt-{attempt}.txt').write_text(text)
        try:
            spec = parse_spec(text)
            break
        except ValueError:
            if attempt == 1:
                raise
    (job / 'layout-raw.txt').write_text(text)
    spec['primaryOnlyRetry'] = attempt > 0
    spec['sourceCount'] = len(photographs)
    spec['quality'] = request['quality']
    spec['device'] = device
    write_json(job / 'scene-spec.json', spec)
    del model, processor, inputs, output
    if device == 'mps':
        torch.mps.empty_cache()
    progress('solidifying', 60)
    blender = os.environ.get('SPATIAL_BLENDER', str(RUNTIME / (
        'Blender.app/Contents/MacOS/Blender' if sys.platform == 'darwin' else 'blender/blender')))
    subprocess.run([blender, '--background', '--factory-startup', '--threads', '6',
        '--python-exit-code', '1', '--python', str(ROOT / 'spatial/build_solids.py'), '--', str(job)],
        check=True, timeout=1200)
    subprocess.run([blender, '--background', '--factory-startup', '--threads', '6',
        '--python-exit-code', '1', '--python', str(ROOT / 'spatial/verify_glb.py'), '--', str(job)],
        check=True, timeout=180)
    metadata = json.loads((job / 'scene.json').read_text())
    if metadata.get('qualityGate', {}).get('status') != 'passed' or not metadata['qualityGate'].get('exportRoundTrip'):
        raise ValueError('형태 안정성 검사를 통과하지 못해 3D 결과를 표시하지 않습니다. 다른 사진으로 다시 시도해 주세요.')
    for name in ['scene.glb', 'scene.blend', 'preview.jpg']:
        if not (job / name).exists() or (job / name).stat().st_size < 100:
            raise ValueError('검증된 3D 파일을 완성하지 못했습니다. 다시 생성해 주세요.')
    state['result'] = metadata
    progress('ready', 100)


if __name__ == '__main__':
    import traceback
    job = Path(sys.argv[1]).resolve()
    try:
        run(job)
    except Exception as error:
        traceback.print_exc()
        state = json.loads((job / 'status.json').read_text()) if (job / 'status.json').exists() else {}
        message = str(error) if isinstance(error, ValueError) else '안정형 3D 생성을 완료하지 못했습니다. 메모리와 모델 설치 상태를 확인해 주세요.'
        state.update(stage='failed', error=message[:500])
        write_json(job / 'status.json', state)
        sys.exit(1)
