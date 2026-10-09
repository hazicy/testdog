import { test } from 'vitest';
import { TextCompiler } from './textCompiler';

test.skipIf(process.env.RUN_LIVE_TESTS !== 'true')('compiler', async () => {
  const compiler = new TextCompiler();

  const response = await compiler.compile(
    '进入 bilibili 2. 填入搜索框：极客湾 2. 提交搜索（按 Enter，或点“搜索”按钮）3. 等搜索结果页出现4. 点击视频结果列表中的第一个视频 5. 关闭该视频回到主页 6. 再随便点进一个视频，再关闭 7. 搜索pubg视频找到最火的视频并点进去观看 8.关闭这个视频，搜索勇哥，看勇哥去',
  );

  console.log('response', response);
});
