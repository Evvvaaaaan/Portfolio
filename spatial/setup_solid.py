"""Install a public, pinned vision model for local structured 3D reconstruction."""
import os
from pathlib import Path
from huggingface_hub import snapshot_download

root = Path(__file__).resolve().parents[1]
runtime = Path(os.environ.get('SPATIAL_RUNTIME', root / '.spatial-runtime'))
snapshot_download('Qwen/Qwen3-VL-2B-Instruct',
                  revision='89644892e4d85e24eaac8bacfd4f463576704203',
                  local_dir=runtime / 'models-layout',
                  allow_patterns=['*.json', '*.txt', '*.safetensors', 'README.md'],
                  max_workers=2)
print('Local layout model installed. Apache-2.0 model; no generation API fees.')
