---
name: img
description: 压缩图片、转 WebP、缩放、裁切、SVG 转 PNG。处理图片资源、图标、logo，或用户说"压缩图片"时用。
---

# 图片处理

```bash
tools/img.sh png 输入.png [输出.png]          # 有损量化 + 无损优化，UI、图标首选
tools/img.sh lossless 输入.png [输出.png]     # 只做无损优化
tools/img.sh webp 输入 [输出.webp] [质量=80]
tools/img.sh resize 输入 512x512 输出         # 保持比例，只缩不放
tools/img.sh crop 输入 200x100+10+10 输出
tools/img.sh svg 输入.svg 宽度 输出.png
tools/img.sh info 文件...
```

- 工具不覆盖原图（输出不能和输入同名）。确认效果后再替换。
- 新图标优先写成 SVG 再转 PNG，改起来只需编辑文本。
- OG 图和 favicon 要保持 PNG，有些平台不认 WebP。
- 给 Claude 看的大图先缩到 800px 左右，省 Token。
