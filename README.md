# GitHub Pages 团队日历

此目录是一套公开的只读日历站点和日历数据文件。手机浏览器从 GitHub Pages 查看；电脑成员在 Edge 或 Chrome 打开站点，连接本机已克隆仓库中的 `calendar.json` 编辑。保存只写入本机文件，仍由成员按团队现有 GitHub 流程提交、push。站点读取的公开 `calendar.json` 随 push 更新。无需给日历应用注册账号；GitHub 仓库仍按你们现有方式管理编辑权限。

## 建立发布仓库

不要将当前工作台所在的大仓库改为公开。请新建一个独立的 **Public** GitHub 仓库（例如 `team-calendar`），仅放入此目录根目录下的文件。所有要编辑日历的团队成员都需要对该仓库有写权限；手机查看无需登录。当前工作台目录所在的大仓库没有远程地址，且包含其他项目，不能直接拿来发布。

启用 GitHub Pages：仓库 **Settings → Pages → Build and deployment** 选择从 `main` 分支的根目录发布。Pages 提供默认 `github.io` 地址，无需另购域名。

## 团队电脑操作

1. 克隆公开日历仓库到电脑，并先执行 `git pull`。首次迁移当前本地日历时，在工作台目录运行 `python -m team_calendar.export_github_calendar`，再将生成的 `team_calendar/github_pages/calendar.json` 复制到日历仓库根目录并 push。
2. 用 Edge 或 Chrome 打开仓库 GitHub Pages 的日历地址。
3. 点击“连接电脑上的日历文件”，选刚克隆目录里的 `calendar.json` 并授予读写权限。权限仅在当前浏览器配置文件内保存。
4. 在月历或周历点击日期新建工作项；拖动事项改期或拉动两端调整跨度。保存会写入本机 `calendar.json`。
5. 在该仓库执行 `git add calendar.json`、`git commit`、`git push`。push 完成后，手机和其他成员刷新网页即可看到内容。

手机只提供查看。公开仓库中的 `calendar.json` 和工作安排对所有能访问网址的人可见；不要放入密码、客户资料或其他不宜公开的内容。

## 合并约定

开工前先 pull，完成后再提交并 push。若多人同时修改了同一份 `calendar.json`，Git 可能要求先解决合并冲突；保存后的工作项在本机文件中，不会由日历站点上传。如果推送被拒绝，先 pull、处理冲突，再 push。提醒功能可在后续版本增加。

