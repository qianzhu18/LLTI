#!/usr/bin/env python3
import argparse
import base64
import json
import os
import re
from pathlib import Path

import requests


ENDPOINT = "https://www.sophnet.com/api/open-apis/projects/easyllms/imagegenerator/google/models/gemini-3-pro-image-preview:generateContent"
DEFAULT_PROMPT = (
    "一张适合榴莲人格测试分享卡的主视觉，赛博像素风，榴莲角色，黄色果肉，绿色外壳，"
    "带一点年轻人社交测试感，干净背景，可用于网页产品 Demo，不要出现真实品牌 logo，不要文字"
)
PROMPT_GUARD = (
    "请生成一张完全无文字的正方形 1:1 角色插画，主体居中，干净背景。"
    "画面中禁止出现任何中文、英文、数字、标语、招牌、logo、水印、边框文字或字幕。"
)


def load_dotenv(path=Path(".env")):
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        value = line.strip()
        if not value or value.startswith("#") or "=" not in value:
            continue
        key, raw = value.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = raw.strip().strip('"').strip("'")


def get_api_key():
    load_dotenv()
    return (os.getenv("SOPHNET_API_KEY") or os.getenv("GEMINI_IMAGE_API_KEY") or "").strip().strip("{}")


def extract_image_data(data):
    for candidate in data.get("candidates", []):
        parts = candidate.get("content", {}).get("parts", [])
        for part in parts:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return inline["data"]
    raise KeyError("candidates[0].content.parts 中没有 inlineData.data")


def request_image(prompt, api_key):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload = {"contents": [{"parts": [{"text": f"{PROMPT_GUARD}\n\n视觉设定：{prompt}"}]}]}

    response = requests.post(ENDPOINT, headers=headers, json=payload, timeout=90)
    try:
        data = response.json()
    except ValueError as exc:
        raise SystemExit(f"接口没有返回 JSON，状态码 {response.status_code}: {response.text[:500]}") from exc

    if response.status_code != 200:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        raise SystemExit(response.status_code)

    try:
        return extract_image_data(data)
    except (KeyError, IndexError, TypeError) as exc:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        raise SystemExit(f"未找到图片数据: {exc}") from exc


def write_image(image_data, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(base64.b64decode(image_data))
    print(f"图片已保存为 {output}", flush=True)


def load_config(path):
    config_path = Path(path)
    with config_path.open(encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, dict):
        raise SystemExit(f"{config_path} 必须是以人格 code 为 key 的 JSON 对象")
    return data


def asset_path(src):
    if not src.startswith("/assets/"):
        raise ValueError(f"图片路径必须以 /assets/ 开头: {src}")
    return Path("public") / src.lstrip("/")


def extract_type_codes(data_file=Path("src/data.js")):
    source = data_file.read_text(encoding="utf-8")
    return sorted(set(re.findall(r'code:\s*"([^"]+)"', source)))


def validate_config(config, require_files=True):
    codes = extract_type_codes()
    config_codes = sorted(config.keys())
    missing_config = [code for code in codes if code not in config]
    extra_config = [code for code in config_codes if code not in codes]
    invalid_entries = []
    missing_files = []

    for code in codes:
        item = config.get(code) or {}
        for key in ("src", "alt", "prompt"):
            if not item.get(key):
                invalid_entries.append(f"{code}.{key}")
        if item.get("src"):
            try:
                output = asset_path(item["src"])
            except ValueError as exc:
                invalid_entries.append(f"{code}.src: {exc}")
            else:
                if require_files and not output.exists():
                    missing_files.append(str(output))

    print(f"人格类型: {len(codes)}")
    print(f"图片配置: {len(config_codes)}")
    if missing_config:
        print("缺少配置:", ", ".join(missing_config))
    if extra_config:
        print("多余配置:", ", ".join(extra_config))
    if invalid_entries:
        print("字段不完整:", ", ".join(invalid_entries))
    if missing_files:
        print("缺少图片文件:")
        for item in missing_files:
            print(f"  - {item}")

    ok = not missing_config and not extra_config and not invalid_entries and not missing_files
    print("完整性检查:", "通过" if ok else "未通过")
    return ok


def generate_from_config(config, api_key, target_type=None, force=False):
    codes = [target_type] if target_type else sorted(config.keys())
    for code in codes:
        if code not in config:
            raise SystemExit(f"未找到人格图片配置: {code}")
        item = config[code]
        output = asset_path(item["src"])
        if output.exists() and not force:
            print(f"已存在，跳过 {code}: {output}", flush=True)
            continue
        print(f"正在生成 {code}...", flush=True)
        image_data = request_image(item["prompt"], api_key)
        write_image(image_data, output)


def main():
    parser = argparse.ArgumentParser(description="Generate a durian visual asset with Sophnet image API.")
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--out", default="public/assets/generated-durian-card.jpg")
    parser.add_argument("--config", default="src/personaImages.json")
    parser.add_argument("--type", help="只生成某一个人格 code，例如 GOLD-I")
    parser.add_argument("--all", action="store_true", help="按配置批量生成全部人格图")
    parser.add_argument("--force", action="store_true", help="覆盖已存在的图片")
    parser.add_argument("--check", action="store_true", help="检查人格图片配置和本地图片文件完整性")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.check:
        raise SystemExit(0 if validate_config(config) else 1)

    api_key = get_api_key()
    if not api_key:
        raise SystemExit("请先设置 SOPHNET_API_KEY，或在 .env 中写入 SOPHNET_API_KEY=你的key")

    if args.all or args.type:
        generate_from_config(config, api_key, target_type=args.type, force=args.force)
        return

    image_data = request_image(args.prompt, api_key)
    write_image(image_data, Path(args.out))


if __name__ == "__main__":
    main()
