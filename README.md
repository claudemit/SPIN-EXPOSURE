# Spin Exposure

基于 Canvas 2D 的离线旋转曝光实验 Demo。所有页面都是单文件 HTML，内嵌样张，无需服务器或外部依赖。

## 当前版本

打开 [`spin_exposure_a1_v2_compare.html`](spin_exposure_a1_v2_compare.html)。它只保留 A1 径向角度曲线，并提供四档画质诊断：

- `BASE`：原 Canvas 2D 混合基线
- `LINEAR`：逐采样线性光积分
- `LINEAR + Strong Time`：独立测试时间权重
- `LINEAR + Strong Highlight`：独立测试高光响应

页面可选内嵌样张或导入本地图片；支持拖动旋转中心、调整旋转／拖影／中心清晰、按住查看原图及导出 PNG。交互时显示快速近似预览，停止后补算当前模式的高质量结果。

## 历史实验

- [`spin_exposure_a1_refined_demo.html`](spin_exposure_a1_refined_demo.html)：A1 单方案精修版
- [`spin_exposure_canvas2d_demo_v1_3_radial_compare.html`](spin_exposure_canvas2d_demo_v1_3_radial_compare.html)：早期径向方案对比

`assets/logo.png` 是图标素材，当前 Demo 未引用。
