export const regressionCases = [
  {
    id: 'login',
    goal: '邮箱填写 ada@example.com，密码填写 TestPassword123!，点击登录。',
    expected: '登录成功：ada@example.com',
  },
  { id: 'search', goal: '搜索框填写 Playwright，点击搜索。', expected: '搜索结果：Playwright' },
  { id: 'enter', goal: '搜索框填写 Chromium，按回车搜索。', expected: '搜索结果：Chromium' },
  { id: 'dialog', goal: '点击删除草稿，在确认对话框中点击确认删除。', expected: '草稿已删除' },
  { id: 'cancel', goal: '点击删除草稿，在确认对话框中点击取消。', expected: '草稿已保留' },
  { id: 'select', goal: '在城市下拉框中选择上海，点击保存城市。', expected: '城市已保存：上海' },
  { id: 'checkbox', goal: '勾选同意条款，然后点击继续。', expected: '条款已接受' },
  { id: 'async', goal: '点击加载订单，等待订单加载完成。', expected: '订单 A100 已加载' },
  {
    id: 'duplicate',
    goal: '点击页面底部的注册链接，不要点击表单中的注册按钮。',
    expected: '创建账号',
  },
  {
    id: 'form',
    goal: '姓名填写 Ada，邮箱填写 ada@example.com，然后点击订阅更新。',
    expected: '订阅成功：Ada，ada@example.com',
  },
] as const;
