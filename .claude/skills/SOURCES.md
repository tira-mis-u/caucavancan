# Nguồn các skill trong project này
Chỉ dùng cho project Câu Cá Vạn Cân 3D. Tất cả chỉ là hướng dẫn markdown (không có script/hook).
- frontend-design — github.com/anthropics/skills (Anthropic)
- threejs-scene-setup, threejs-materials-lighting, performance-optimization, physics-tuning, game-ui-ux, shader-programming — github.com/gamedev-skills/awesome-gamedev-agent-skills (Apache-2.0)
- threejs-postprocessing — github.com/CloudAI-X/threejs-skills (MIT)

Lưu ý: các skill viết cho three.js r150+/r187 (ES modules). Game này cố ý dùng three.js r128
bản global để mở được index.html trực tiếp (file://). Khi áp dụng, giữ r128: dùng
THREE.EffectComposer từ three@0.128.0/examples/js, không dùng `three/addons`.
