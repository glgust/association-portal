# 首次发布指南

开源版使用独立仓库，建议名为 `association-portal`。不得把自用仓库改成公开，也不要推送其历史、标签或全部分支。

## 发布前核对

- 确认对拟发布源码和素材拥有授权；开源授权不会自动改变协会内部的资产归属。第三方组件按各自条款分发。
- 本目录只包含公开源文件，不含 `.env`、数据目录、备份、内部截图或原仓库 Git 历史。
- 运行 `pnpm check` 与构建；执行测试数据库迁移和浏览器流程，保存实际结果。无法执行时不得写“通过”。
- 确认 README、LICENSE、维护说明和 v1.0.0 发布说明完整，根包版本为 1.0.0。

## 独立仓库和 Release

若使用不含 Git 历史的源码压缩包，先确认本目录文件清单，再建立首次提交：

```sh
git init -b main
git add .
git commit -m "Prepare v1.0.0 first test release"
```

`git add` 前必须保留随包提供的 `.gitignore`，确保配置和测试数据未被跟踪。

附带的 `scripts/publish-initial-release.sh OWNER/association-portal` 需本机 GitHub CLI 已认证。它只接受一个无远程、仅有单个初始提交的干净仓库；会创建新公开仓库、推送源码和 `v1.0.0` 标签，再建立标为 prerelease 的 GitHub Release。已有同名仓库时会停止，不覆盖它。

发布后检查 Actions 的 **Publish application images**。源码 Release 建立不代表镜像已经可用，需等验证及两个组件的多架构构建成功。镜像为 `ghcr.io/OWNER/association-portal-web:v1.0.0` 和 `association-portal-cms:v1.0.0`，不会改写自用门户的镜像名。首次 GHCR 包可能为私有；确认要公开后在包设置中检查可见性并验证匿名拉取。

在仓库 Security 设置启用 private vulnerability reporting，再确认 SECURITY.md 中的入口实际可用。归档或停止维护时更新 MAINTENANCE.md，避免保留不存在的支持承诺。
