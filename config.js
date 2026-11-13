/* 项目的名字和地址都集中在这里。改名 / 换仓库，只需要改这个文件和 package.json。 */
module.exports = {
  name: 'PixPeel',
  appId: 'com.pixpeel.app',
  /* 仓库地址：“你的用户名/仓库名”，“检查更新”靠它 */
  repo: 'lertone/PixPeel',
  get repoUrl() { return 'https://github.com/' + this.repo; },
  get configured() { return !/YOUR_/.test(this.repo); }
};
