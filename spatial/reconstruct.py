"""Photographs -> jointly inferred geometry -> an actual Blender project.

All inputs/outputs stay in the job directory. This worker never executes uploaded
code and never substitutes demo geometry for a reconstruction.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = Path(os.environ.get("SPATIAL_RUNTIME", ROOT / ".spatial-runtime"))
os.environ.setdefault("MPLCONFIGDIR", str(RUNTIME / "cache/matplotlib"))
os.environ.setdefault("HF_HOME", str(RUNTIME / "cache/huggingface"))
os.environ.setdefault("XDG_CACHE_HOME", str(RUNTIME / "cache"))
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
sys.path.insert(0, str(RUNTIME / "vendor/Depth-Anything-3-main/src"))


def write_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    temporary.replace(path)


def complete_scene(job, metadata, blender, progress):
    """Keep the usable observed reconstruction if experimental completion fails."""
    try:
        progress('completing', 76)
        subprocess.run([sys.executable, str(ROOT / 'spatial/complete.py'), str(job)], check=True, timeout=1800)
        completed = json.loads((job / 'scene.json').read_text())
        progress('blender', 95)
        subprocess.run([blender, '--background', '--factory-startup', '--threads', '6',
                        '--python-exit-code', '1', '--python', str(ROOT / 'spatial/export_blender.py'),
                        '--', str(job), '--completed'], check=True, timeout=420)
        for artifact in ['completed.blend', 'completed.glb']:
            if not (job / artifact).is_file() or (job / artifact).stat().st_size < 100:
                raise RuntimeError(f'Blender completion output missing: {artifact}')
        return completed
    except (subprocess.SubprocessError, RuntimeError):
        traceback.print_exc()
        metadata['completion'] = dict(status='failed', local=True, apiCost=0,
            warning='AI 보완을 완료하지 못해 관측 복원만 표시합니다. 메모리와 설치 상태를 확인하거나 겹치는 사진을 추가해 다시 시도해 주세요. 유료 API로 전환하지 않았습니다.')
        write_json(job / 'scene.json', metadata)
        return metadata


def run(job):
    import numpy as np
    import torch
    from PIL import Image, ImageOps
    from depth_anything_3.api import DepthAnything3
    from geometry import reconstruct_view, write_splats

    started = time.time()
    request = json.loads((job / "request.json").read_text())
    state = dict(id=job.name, name=request["name"], createdAt=request["createdAt"],
                 imageCount=len(request["files"]), quality=request["quality"], completion=request.get('completion', 'observed'))

    def progress(stage, fraction):
        state.update(stage=stage, progress=fraction, elapsed=round(time.time() - started))
        write_json(job / "status.json", state)
        print(json.dumps({"stage": stage, "elapsed": state["elapsed"]}), flush=True)

    progress("validating", 6)
    Image.MAX_IMAGE_PIXELS = 36_000_000
    originals = []
    warnings = []
    for i, file in enumerate(request["files"]):
        try:
            with Image.open(job / file) as source:
                if min(source.size) < 160:
                    raise ValueError("사진의 짧은 변이 160px 이상이어야 합니다.")
                image = ImageOps.exif_transpose(source).convert("RGB")
                image.thumbnail((2560, 2560), Image.Resampling.LANCZOS)
        except (OSError, Image.DecompressionBombError) as error:
            raise ValueError(f"사진 {i + 1}: 사진을 읽을 수 없습니다. 손상되지 않은 JPG, PNG, WebP 파일로 다시 선택해 주세요.") from error
        image.save(job / f"source-{i}.jpg", quality=95)
        originals.append(image)
        if min(image.size) < 600:
            warnings.append(f"사진 {i + 1}: 해상도가 낮아 작은 물체의 깊이가 부정확할 수 있습니다.")
    progress("estimating", 20)
    torch.set_num_threads(min(8, os.cpu_count() or 4))
    device = os.environ.get("SPATIAL_DEVICE") or (
        "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    )
    model = DepthAnything3.from_pretrained(str(RUNTIME / "models")).to(device).eval()
    resolution = 756 if request["quality"] == "detail" and len(originals) <= 4 else 504
    # The upstream API supports MPS, CUDA and CPU autocast. Camera/depth are
    # inferred jointly, including when only one view is supplied.
    prediction = model.inference(originals, process_res=resolution)
    del model
    if device == "mps":
        torch.mps.empty_cache()
    engine = "Depth Anything 3 · BASE"
    if request["quality"] == "detail" and len(originals) == 1:
        progress("refining", 43)
        refiner = DepthAnything3.from_pretrained(str(RUNTIME / "models-metric")).to(device).eval()
        refined = refiner.inference(originals, process_res=resolution)
        # Keep the BASE camera calibration / relative scale, use the larger
        # monocular model for finer surface detail. Never claim surveyed meters.
        refined_depth = refined.depth.astype(np.float32)
        refined_depth *= np.median(prediction.depth) / max(float(np.median(refined_depth)), 1e-6)
        prediction.depth = refined_depth
        engine += " + METRIC-LARGE"
        del refiner, refined
        if device == "mps":
            torch.mps.empty_cache()
    progress("meshing", 62)
    np.savez_compressed(job / "reconstruction.npz", depth=prediction.depth,
                        confidence=prediction.conf, intrinsics=prediction.intrinsics,
                        extrinsics=prediction.extrinsics, images=prediction.processed_images)
    first_extrinsic = np.eye(4)
    first_extrinsic[:3] = prediction.extrinsics[0]
    cameras, splats, confidence = [], [], []
    vertices_count = triangles_count = 0
    bounds = []
    for i, original in enumerate(originals):
        depth = prediction.depth[i].astype(np.float32)
        if not np.isfinite(depth).all() or np.median(depth) <= 0:
            raise ValueError("깊이 추정이 불안정합니다. 선명하고 겹치는 영역이 있는 사진으로 다시 시도해 주세요.")
        height, width = depth.shape
        # Reproduce upstream resizing and batch centre cropping on the original
        # resolution photograph, keeping the texture sharper than the depth grid.
        from depth_anything_3.utils.io.input_processor import InputProcessor
        processor = InputProcessor()
        resized = processor._resize_image(original, resolution, "upper_bound_resize")
        rw, rh = processor._make_divisible_by_resize(resized, processor.PATCH_SIZE).size
        left, top = (rw - width) // 2, (rh - height) // 2
        ow, oh = original.size
        texture = original.crop((left * ow / rw, top * oh / rh,
                                 (left + width) * ow / rw, (top + height) * oh / rh))
        texture.save(job / f"texture-{i}.jpg", quality=96)
        result = reconstruct_view(depth, prediction.conf[i], prediction.intrinsics[i],
                                  prediction.extrinsics[i], first_extrinsic,
                                  np.asarray(texture.resize((width, height))),
                                  stride=2 if len(originals) > 1 else 1)
        np.savez_compressed(job / f"surface-{i}.npz", vertices=result["vertices"],
                            faces=result["faces"], uv=result["uv"])
        vertices_count += len(result["vertices"])
        triangles_count += len(result["faces"])
        bounds.append(np.percentile(result["vertices"], [2, 98], axis=0))
        cameras.append(result["camera"] | {"image": f"texture-{i}.jpg", "index": i})
        splats.append(result["splats"])
        confidence.append(result["retained"])
        near, far = np.percentile(depth, [2, 98])
        gray = np.clip((depth - near) / max(far - near, 1e-6), 0, 1)
        # Readable depth visualization; values are inferred relative distances.
        colors = np.stack((0.12 + .68 * gray, .2 + .6 * gray, .4 + .35 * (1-gray)), -1)
        Image.fromarray(np.uint8(colors * 255)).save(job / f"depth-{i}.jpg", quality=90)
    if triangles_count < 1000:
        raise ValueError("복원 가능한 표면이 부족합니다. 공간 전체가 선명하게 보이는 사진을 사용해 주세요.")
    write_splats(job / "scene.splat", splats)
    if len(originals) == 1:
        warnings.insert(0, "한 장의 사진에서 추정한 표면입니다. 원래 시점 주변에서 확인하세요. 가려진 뒷면은 복원되지 않습니다.")
    else:
        warnings.insert(0, "사진이 겹치지 않거나 반사·투명 표면이 많은 경우 정렬과 표면에 오차가 생길 수 있습니다.")
    warnings.append("거리는 상대 척도입니다. 실제 치수 측정이나 완전한 360° 복원을 보장하지 않습니다.")
    combined_bounds = np.stack(bounds)
    metadata = dict(engine=engine, device=device, resolution=resolution,
                    sourceCount=len(originals), vertices=vertices_count, triangles=triangles_count,
                    splats=sum(len(s) for s in splats), cameras=cameras, warnings=warnings,
                    bounds=[combined_bounds[:, 0].min(0).tolist(), combined_bounds[:, 1].max(0).tolist()],
                    retainedSurface=round(float(np.mean(confidence)), 3), scale="relative",
                    representation="photo-textured inferred surfaces", license="Apache-2.0")
    write_json(job / "scene.json", metadata)
    if len(originals) > 1:
        progress("fusing", 72)
        # Open3D stays in a separate process from PyTorch's OpenMP runtime.
        subprocess.run([sys.executable, str(ROOT / "spatial/fuse.py"), str(job)],
                       check=True, timeout=300)
        metadata = json.loads((job / "scene.json").read_text())
    progress("blender", 74 if request.get('completion') == 'local' else 80)
    blender = os.environ.get("SPATIAL_BLENDER", str(RUNTIME / (
        "Blender.app/Contents/MacOS/Blender" if sys.platform == "darwin" else "blender/blender")))
    subprocess.run([blender, "--background", "--factory-startup", "--threads", "6",
                    "--python-exit-code", "1", "--python", str(ROOT / "spatial/export_blender.py"),
                    "--", str(job)], check=True, timeout=420)
    for artifact in ["scene.blend", "scene.glb", "preview.jpg"]:
        if not (job / artifact).is_file() or (job / artifact).stat().st_size < 100:
            raise RuntimeError(f"Blender output missing: {artifact}")
    if request.get('completion') == 'local':
        metadata = complete_scene(job, metadata, blender, progress)
    state["result"] = metadata
    progress("ready", 100)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("job", type=Path)
    args = parser.parse_args()
    try:
        run(args.job.resolve())
    except Exception as error:
        traceback.print_exc()
        status_path = args.job / "status.json"
        state = json.loads(status_path.read_text()) if status_path.exists() else {}
        state.update(stage="failed", error=str(error)[:500])
        write_json(status_path, state)
        sys.exit(1)
