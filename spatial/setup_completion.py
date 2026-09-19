"""Download the optional free local inpainting model, never call a paid API."""
import os
from pathlib import Path
from huggingface_hub import snapshot_download, hf_hub_download

root = Path(__file__).resolve().parents[1]
runtime = Path(os.environ.get('SPATIAL_RUNTIME', root / '.spatial-runtime'))
snapshot_download('diffusers/stable-diffusion-xl-1.0-inpainting-0.1',
                  revision='115134f363124c53c7d878647567d04daf26e41e',
                  local_dir=runtime / 'models-inpaint',
                  allow_patterns=['*.json', '*.txt', '*.md', '*.fp16.safetensors'],
                  max_workers=3)
hf_hub_download('stabilityai/stable-diffusion-xl-base-1.0', 'LICENSE.md',
                revision='462165984030d82259a11f4367a4eed129e94a7b',
                local_dir=runtime / 'models-inpaint')
print('Local inpainting model installed; no per-generation API charges.')
