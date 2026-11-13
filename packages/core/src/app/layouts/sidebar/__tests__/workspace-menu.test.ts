import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dictionaries } from '@dsh-workbench/shared';
import { shouldToggleWorkspaceMenu } from '../workspace-menu-toggle';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const ROW_ACTION = read('WorkspaceRowAction.tsx');
const ROW_LABEL = read('WorkspaceRowLabel.tsx');
const ITEMS = read('workspace-items.tsx');
const SWITCHER = read('ProjectSwitcher.tsx');
const MENU = read('WorkspaceRowMenu.tsx');
const ALIAS = read('WorkspaceAliasDialog.tsx');
const DELETE = read('WorkspaceDeleteDialog.tsx');
const WRITE = read('use-workspace-write.ts');
const WRITES = read('sidebar-inject.ts');
const CLIENT = read('../../client.tsx');

describe('工作区行的三点菜单：悬停换图标、点开是菜单', () => {
  it('★ 三点那颗挨着行尾开（align=end），锚点就是那颗钮本身', () => {
    expect(ROW_ACTION).toContain('IconEllipsisOutlineRegular');
    expect(ROW_ACTION).not.toContain('IconEditOutlineRegular');
    expect(ROW_ACTION).toContain('aria-haspopup="menu"');
    expect(ROW_ACTION).toContain("onMenu({ element: event.currentTarget, align: 'end', mode: 'toggle' })");
    expect(ROW_ACTION).toContain('data-workspace-menu-trigger=""');
    expect(ROW_ACTION).toContain('aria-expanded={menuOpen}');
    expect(ITEMS).toContain('menuOpen={openMenuId === workspace.workspaceId}');
    expect(SWITCHER).toContain('openMenuId: menu?.workspace.workspaceId ?? null');
  });

  it('★ 三点那颗是 toggle（照 dsh 官方那一条判据）：开着再点同一条就是关，其余都是重新开', () => {
    expect(shouldToggleWorkspaceMenu('toggle', 'w1', 'w1')).toBe(true);
    expect(shouldToggleWorkspaceMenu('toggle', 'w1', 'w2')).toBe(false);
    expect(shouldToggleWorkspaceMenu('toggle', null, 'w1')).toBe(false);
    expect(shouldToggleWorkspaceMenu('open', 'w1', 'w1')).toBe(false);
    expect(MENU).toContain('shouldToggleWorkspaceMenu(open.mode, openFor, workspace.workspaceId)');
    expect(SWITCHER).toContain('setMenu((current) => nextWorkspaceMenu(current, workspace, open))');
  });

  it('★ 菜单不跟行走：行 hover 才在，开菜单时选择器留着（关掉选择器 = 用户点开的那把列表凭空没了）', () => {
    const branch = SWITCHER.slice(
      SWITCHER.indexOf('onMenu: (workspace, open) =>'),
      SWITCHER.indexOf('[sections, currentId, hoverId'),
    );

    expect(ITEMS).toContain('onMenu={openMenu}');
    expect(ITEMS).not.toContain('<Menu');
    expect(branch).toContain('setMenu((current) => nextWorkspaceMenu(current, workspace, open))');
    expect(branch).not.toContain('setOpen(false)');
  });

  it('★ 选中一项之后才把选择器收起来（三个动作都收）', () => {
    const branch = SWITCHER.slice(SWITCHER.indexOf('<WorkspaceRowMenu'), SWITCHER.indexOf('{naming === null'));

    expect(branch.match(/setOpen\(false\)/g)).toHaveLength(3);
    expect(branch).toContain('setNaming(workspace)');
    expect(branch).toContain('setDeleting(workspace)');
    expect(branch).toContain('onReveal(path)');
  });

  it('★ 菜单本体挂在开关上（SelectField 的兄弟），锚点交给那颗钮：CSS anchor 定位，不自己算坐标', () => {
    expect(SWITCHER).toContain('<WorkspaceRowMenu');
    expect(MENU).toContain('<Menu');
    expect(MENU).toContain('portal');
    expect(MENU).toContain('anchorRef');
    expect(MENU).toContain('anchorPoint: point');
    expect(MENU).toContain('createPortal(menu, document.body)');
    expect(MENU).not.toContain('getBoundingClientRect');
  });

  it('★ 关菜单这件事归菜单自己（window 捕获）：别的弹层先关、或事件被谁 stop 掉，都带不走它', () => {
    expect(MENU).toContain("window.addEventListener('pointerdown', dismiss, true)");
    expect(MENU).toContain("window.addEventListener('keydown', escape, true)");
    expect(MENU).toContain("node.closest(`.${styles.list}`) !== null");
    expect(MENU).toContain('listClassName={styles.list}');
    expect(MENU).toContain("if (event.key !== 'Escape') return");
    expect(MENU).toContain('event.preventDefault()');
  });

  it('★ 那张卡上的 .list 是承重的：类没了 styles.list 就是 undefined，点自己那一项也会先关菜单（click 不再产生）', () => {
    expect(read('WorkspaceRowMenu.module.css')).toContain('.list {');
    expect(read('WorkspaceRowMenu.module.css')).toContain('.portalRoot {');
    expect(MENU).toContain('listClassName={styles.list}');
  });

  it('★ 菜单根节点不挂在行里：anchorRef 模式（含关着）display: contents；右键 point 模式固定 0×0，都不占行盒', () => {
    expect(MENU).toContain('className={point === undefined ? styles.portalRoot : undefined}');
    expect(MENU).toContain('createPortal(menu, document.body)');
    expect(MENU).not.toContain('className={styles.anchor}');
  });
});

describe('右键工作区那一项：跟 dsh 官方同一套（指针位置开菜单，键盘也认）', () => {
  it('★ 右键在指针处开菜单，不是浏览器菜单；开在指针右下（align=start）', () => {
    expect(ROW_LABEL).toContain("row.addEventListener('contextmenu', context)");
    expect(ROW_LABEL).toContain('event.preventDefault()');
    expect(ROW_LABEL).toContain('event.stopPropagation()');
    expect(ROW_LABEL).toContain("menuRef.current?.({ point, align: 'start', mode: 'open' })");
    expect(MENU).toContain("align={target?.align ?? 'end'}");
  });

  it('★ 键盘那次：ContextMenu 键与 Shift+F10（跟官方同一个判据），开在行的左下', () => {
    expect(ROW_LABEL).toContain("event.key !== 'ContextMenu'");
    expect(ROW_LABEL).toContain("event.key === 'F10' && event.shiftKey");
    expect(ROW_LABEL).toContain("show(event, { x: rect.left, y: rect.bottom })");
  });

  it('★ 右键落点：指针在哪就开在哪（键盘触发时客户端坐标是 0，才退回行的 rect）', () => {
    expect(ROW_LABEL).toContain('const keyboard = event.clientX === 0 && event.clientY === 0');
    expect(ROW_LABEL).toContain('x: rect?.left ?? event.clientX, y: rect?.bottom ?? event.clientY');
    expect(ROW_LABEL).toContain('row.focus({ preventScroll: true })');
  });
});

describe('菜单里的三项：设置别名 / 在 Finder 中显示 / 删除工作区', () => {
  it('★ 顺序固定，删除那一项是危险色，且与上面两项之间有线', () => {
    const alias = MENU.indexOf("id: 'alias'");
    const reveal = MENU.indexOf("id: 'reveal'");
    const remove = MENU.indexOf("id: 'delete'");

    expect(alias).toBeGreaterThan(-1);
    expect(reveal).toBeGreaterThan(alias);
    expect(remove).toBeGreaterThan(reveal);
    expect(MENU).toContain("{ type: 'separator', id: 'workspace-menu-separator' }");
    expect(MENU.slice(remove)).toContain('danger: true');
    expect(MENU).toContain('IconTrashOutlineRegular');
    expect(MENU).toContain('IconEditOutlineRegular');
  });

  it('★ 打开位置的文案按宿主系统选：macOS 说 Finder，别处说文件夹', () => {
    expect(MENU).toContain('clientSurface().capabilities.macFileManager');
    expect(MENU).not.toContain('hostOs');
    expect(MENU).toContain("'project.menu.reveal.finder'");
    expect(MENU).toContain("'project.menu.reveal.folder'");
    expect(dictionaries.zh['project.menu.reveal.finder']).toBe('在 Finder 中显示');
    expect(dictionaries.zh['project.menu.reveal.folder']).toBe('在文件夹显示');
    expect(dictionaries.en['project.menu.reveal.finder']).toBe('Show in Finder');
  });

  it('★ 别名那一项只是换了个说法：仍写工作区 title，键与文案都落在 alias 名下', () => {
    expect(ALIAS).toContain("t('project.alias.title'");
    expect(ALIAS).toContain("t('project.alias.field')");
    expect(ALIAS).toContain('titleFor(workspace, draft)');
    expect(ALIAS).not.toContain('project.rename.');
    expect(dictionaries.zh['project.menu.alias']).toBe('设置别名');
    expect(dictionaries.en['project.menu.alias']).toBe('Set alias');
  });
});

describe('删除工作区：点菜单不删，二次确认之后才删', () => {
  it('★ 菜单那一项只把目标交给开关，绝不直接删', () => {
    const branch = MENU.slice(MENU.indexOf("if (id === 'delete')"), MENU.indexOf('onReveal(workspace.path)'));

    expect(branch).toContain('onDelete(workspace)');
    expect(branch).not.toContain('workspaces.delete');
    expect(SWITCHER).toContain('onDelete={(workspace) => {');
    expect(SWITCHER).toMatch(/setDeleting\(workspace\)/);
    expect(SWITCHER).toMatch(/onConfirm=\{\(\) => onDelete\(deleting\.workspaceId\)\}/);
  });

  it('★ 确认在对话框里：模态 + 一颗危险色确认键 + 取消键', () => {
    expect(DELETE).toContain('<Modal');
    expect(DELETE).toContain("t('project.delete.title'");
    expect(DELETE).toContain("'project.delete.confirm'");
    expect(DELETE).toContain("'project.delete.cancel'");
    expect(DELETE).toContain('className="wb-dangerAction"');
    expect(DELETE).toContain('onClick={submit}');
    expect(DELETE).toContain('useWorkspaceWrite(onConfirm, onClose)');
  });

  it('★ 失败落在对话框里，不在控制台', () => {
    expect(DELETE).toContain("t('project.delete.failed')");
    expect(WRITE).toContain('setFailed(true)');
    expect(dictionaries.zh['project.delete.failed']).toBe('删除失败，请重试。');
  });
});

describe('写口接线：删除走 dsh 的 workspaces.delete，打开位置走后端的 reveal', () => {
  it('★ 删完才算：deleteWorkspace 只认“不抛错”这一种成功', () => {
    expect(CLIENT).toContain('...workspaceWrites(ctx)');
    expect(WRITES).toContain('await ctx.workspaces.delete(workspaceId as WorkspaceId)');
  });

  it('★ 在文件夹里显示：单数的 remote.session + action reveal，失败走共享提示', () => {
    expect(CLIENT).toContain("'remote.session'");
    expect(WRITES).toContain('ctx.remote.session');
    expect(WRITES).toContain("openWorkspacePath({ path, action: 'reveal' })");
    expect(WRITES).toContain("ctx.get('contextMenus')");
    expect(WRITES).toContain("notify(t('project.reveal.failed'), false)");
    expect(dictionaries.zh['project.reveal.failed']).toBe('无法打开文件夹位置，请重试。');
  });
});
