# 团队共享日历

日历网址：[https://vilyvivi-sv.github.io/team-calendar/](https://vilyvivi-sv.github.io/team-calendar/)。手机打开后只读查看；电脑成员使用 Edge 或 Chrome 打开，可连接本机已克隆仓库中的 `calendar.json` 编辑。日历应用无需账号；GitHub 仓库仍按你们现有方式管理编辑权限。

## 首次使用

1. 日历维护者把成员添加为本仓库协作者，并将仓库地址 `https://github.com/vilyvivi-sv/team-calendar` 分享给团队。
2. 每位编辑者将仓库克隆到自己的电脑，之后每次开始编辑前先 pull。克隆到哪里由你选择，记住保存位置。
3. 在 Edge 或 Chrome 打开上方日历网址，点击“连接日历文件并开始编辑”。文件窗口中找到刚才克隆的仓库目录，选中里面的 `calendar.json` 并授权。每位成员只需连接一次；若按本项目默认位置克隆，文件路径为 `D:\\codex\\SPDB Retail OS\\project\\工作台\\team_calendar\\github_pages_repo\\calendar.json`。
4. 在月历或周历点击日期新建工作项；拖动事项可改期，拖动两端可调整跨日范围。手机默认显示日程列表，只能查看。
5. 保存会写入本机 `calendar.json`，不会自动上传。打开 GitHub Desktop，选中日历仓库，在左下角 Summary 写更新说明，点 **Commit to main**，然后点右上角 **Push origin**。其他成员 pull 后，刷新网页即可看到更新。也可在仓库目录用命令行执行 `git add calendar.json`、`git commit -m "更新团队日历"`、`git push`。

GitHub Pages 使用默认网址，无需另购域名或租用服务器。Pages 会公开仓库中的页面和 `calendar.json`，任何访问者都可查看工作安排；不要写入密码、客户信息或其他不宜公开的内容。

## 多人编辑约定

开始工作前先 pull，完成后再提交并 push。多人同时修改同一份 `calendar.json` 时，Git 可能要求解决合并冲突；先保留双方工作项并完成合并，再 push。GitHub Pages 在 push 后自动更新。提醒功能可在后续版本增加。

## 数据文件

`calendar.json` 是唯一共享数据源，使用 `schema_version: 1`。事项含标题、备注、负责人、开始日期、结束日期、状态及删除标记。结束日期包含当天；删除通过 `deleted_at` 标记，回收站记录不会显示在公开日历中。
