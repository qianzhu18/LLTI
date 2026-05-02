#!/usr/bin/env python3
import argparse
import base64
import json
import os
from pathlib import Path

import requests


ENDPOINT = "https://www.sophnet.com/api/open-apis/projects/easyllms/imagegenerator/google/models/gemini-3-pro-image-preview:generateContent"


def main():
    parser = argparse.ArgumentParser(description="Generate a durian visual asset with Sophnet image API.")
    parser.add_argument(
        "--prompt",
        default=(
            "一张适合榴莲人格测试分享卡的主视觉，赛博像素风，榴莲角色，黄色果肉，绿色外壳，"
            "带一点年轻人社交测试感，干净背景，可用于网页产品 Demo，不要出现真实品牌 logo，不要文字"
        ),
    )
    parser.add_argument("--out", default="public/assets/generated-durian-card.jpg")
    args = parser.parse_args()

    api_key = (os.getenv("SOPHNET_API_KEY") or os.getenv("GEMINI_IMAGE_API_KEY") or "").strip()
    if not api_key:
        raise SystemExit("请先设置 SOPHNET_API_KEY，例如：SOPHNET_API_KEY=你的key python3 scripts/generate_image.py")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload = {"contents": [{"parts": [{"text": args.prompt}]}]}

    response = requests.post(ENDPOINT, headers=headers, json=payload, timeout=90)
    data = response.json()
    if response.status_code != 200:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        raise SystemExit(response.status_code)

    try:
        image_data = data["candidates"][0]["content"]["parts"][0]["inlineData"]["data"]
    except (KeyError, IndexError, TypeError) as exc:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        raise SystemExit(f"未找到图片数据: {exc}") from exc

    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(base64.b64decode(image_data))
    print(f"图片已保存为 {output}")


if __name__ == "__main__":
    main()
