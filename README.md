# Spin Exposure

基于 Canvas 2D 的离线旋转曝光工具，无需服务器或外部依赖。

## 当前版本

桌面浏览器打开 [`spin_exposure_v1_final.html`](spin_exposure_v1_final.html)。小红书小工具使用 [`spin-exposure-xhs-v1-final.zip`](spin-exposure-xhs-v1-final.zip)，包内入口是 [`xhs-mini-tool-v1-final/index.html`](xhs-mini-tool-v1-final/index.html)。

当前正式版使用 A1 径向角度曲线、线性光积分和自适应采样，提供旋转、中心清晰及三套预设。导出时，普通浏览器下载 PNG 到本地；小红书小工具通过 `writeTempFile` 和 `saveImageToPhotosAlbum` 保存到手机相册。

重新生成小工具包：

```sh
python build_xhs_v1_final.py
```

构建脚本从正式版 HTML 提取样张并生成离线文件；手机包使用较低的预览与导出渲染预算。小红书相册保存功能须在小工具容器内使用。

## 历史实验

[`spin_exposure_a1_v2_compare.html`](spin_exposure_a1_v2_compare.html) 用于比较 A1 的四档画质模式：

- `BASE`：原 Canvas 2D 混合基线
- `LINEAR`：逐采样线性光积分
- `LINEAR + Strong Time`：独立测试时间权重
- `LINEAR + Strong Highlight`：独立测试高光响应

该实验页面支持样张、本地图片、旋转中心调整和 PNG 导出。

- [`spin_exposure_a1_refined_demo.html`](spin_exposure_a1_refined_demo.html)：A1 单方案精修版
- [`spin_exposure_canvas2d_demo_v1_3_radial_compare.html`](spin_exposure_canvas2d_demo_v1_3_radial_compare.html)：早期径向方案对比

`assets/logo.png` 是图标素材，当前 Demo 未引用。
