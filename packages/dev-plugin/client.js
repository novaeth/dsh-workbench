window.__ModuleLoader__.load({
  id: '@dsh-workbench/dev-plugin',
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
    var ReactDOM = require('react-dom');
    var ui = require('@deepseek-ai/dsh-client-ui-primitives');

    var SAMPLE = [
      ['fixture-argocd', 'argocd'],
      ['fixture-cmdb', 'cmdb'],
      ['fixture-demo', '演示看板'],
      ['fixture-board', '看板'],
      ['fixture-plain', '无看板模块'],
      ['fixture-long', '一个名字特别特别长的模块用来验证省略号'],
      ['fixture-crash', '崩溃的卡片'],
      ['fixture-kit', '示例模块'],
    ];

    function faceOf(id, title) {
      return {
        unit: id,
        card:
          id === 'fixture-crash'
            ? function () {
                throw new Error('夹具：这张卡片故意渲染失败（看一张卡片崩溃不带走面板）');
              }
            : function () {
                return null;
              },
        messages: {
          zh: Object.fromEntries([[id + '.title', title]]),
          en: Object.fromEntries([[id + '.title', title]]),
        },
      };
    }

    function registerUnits(ctx) {
      if (ctx === undefined || typeof ctx.inject !== 'function') return;
      ctx.inject(['workbenchUnits'], function (sub) {
        var units = sub.get('workbenchUnits');
        if (units === undefined || typeof units.registerUnit !== 'function') return;
        var offs = SAMPLE.map(function (pair) {
          return units.registerUnit(faceOf(pair[0], pair[1]));
        });
        sub.effect(function () {
          return function () {
            offs.forEach(function (off) {
              if (typeof off === 'function') off();
            });
          };
        }, 'dev-fixtures: 注册样本单元');
      });
    }

    var liveSources = [];
    var bumpSerial = 0;

    function wrapEventSource() {
      var Native = window.EventSource;
      if (typeof Native !== 'function' || window.__dshWbFixtureEvents === true) return;
      window.__dshWbFixtureEvents = true;
      function FixtureEventSource(url, config) {
        var source = new Native(url, config);
        liveSources.push(source);
        var close = source.close.bind(source);
        source.close = function () {
          liveSources = liveSources.filter(function (item) { return item !== source; });
          close();
        };
        return source;
      }
      FixtureEventSource.prototype = Native.prototype;
      window.EventSource = FixtureEventSource;
    }

    function refreshFacts() {
      bumpSerial += 1;
      var epoch = 'wb-fixture-' + String(bumpSerial);
      var data = JSON.stringify({ type: 'bump', epoch: epoch, rev: bumpSerial, facts: [] });
      liveSources.slice().forEach(function (source) {
        if (typeof source.onmessage === 'function') {
          source.onmessage(new MessageEvent('message', { data: data }));
        }
      });
    }

    var sceneState = { scenes: [], current: 'real', error: '', listeners: new Set(), version: { scenes: [], current: 'real', error: '' } };

    function subscribe(listener) {
      sceneState.listeners.add(listener);
      return function () {
        sceneState.listeners.delete(listener);
      };
    }

    function snapshot() {
      return sceneState.version;
    }

    function publish(scenes, current, error) {
      sceneState.scenes = scenes;
      sceneState.current = current;
      sceneState.error = error;
      sceneState.version = { scenes: scenes, current: current, error: error };
      sceneState.listeners.forEach(function (listener) { listener(); });
      syncRowHint();
    }

    var menuState = { rect: null, listeners: new Set(), version: { rect: null } };

    function subscribeMenu(listener) {
      menuState.listeners.add(listener);
      return function () { menuState.listeners.delete(listener); };
    }

    function openMenu(rect) {
      menuState.rect = rect;
      menuState.version = { rect: rect };
      menuState.listeners.forEach(function (listener) { listener(); });
    }

    function closeMenu() {
      openMenu(null);
    }

    function groupOf(id) {
      if (id === 'real') return '通用';
      var groups = [
        ['模块市场', 'market-'],
        ['面板', 'panel-'],
        ['添加模块', 'add-'],
        ['启动页', 'boot-'],
      ];
      for (var index = 0; index < groups.length; index += 1) {
        if (id.indexOf(groups[index][1]) === 0) return groups[index][0];
      }
      return '其它';
    }

    function grouped(scenes) {
      var order = ['模块市场', '面板', '添加模块', '启动页', '通用', '其它'];
      var buckets = {};
      scenes.forEach(function (scene) {
        var name = groupOf(scene.id);
        if (buckets[name] === undefined) buckets[name] = [];
        buckets[name].push(scene);
      });
      return order
        .filter(function (name) { return buckets[name] !== undefined && buckets[name].length > 0; })
        .map(function (name) { return [name, buckets[name]]; });
    }

    function labelOf(id) {
      for (var index = 0; index < sceneState.scenes.length; index += 1) {
        if (sceneState.scenes[index].id === id) return sceneState.scenes[index].label;
      }
      return id;
    }

    function syncRowHint() {
      if (typeof document === 'undefined') return;
      var row = document.querySelector('button[aria-label^="调试场景"]');
      if (row === null) return;
      var hint = row.querySelector('[data-fixture-row-hint]');
      if (hint === null) {
        hint = document.createElement('span');
        hint.setAttribute('data-fixture-row-hint', '');
        hint.style.cssText =
          'margin-left:auto;opacity:.55;font-size:11px;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        row.appendChild(hint);
      }
      var text = groupOf(sceneState.current) + ' · ' + labelOf(sceneState.current);
      if (hint.textContent !== text) hint.textContent = text;
      if (hint.title !== text) hint.title = text;
    }

    function clearSceneParam() {
      var url = new URL(location.href);
      if (!url.searchParams.has('wbScene')) return;
      url.searchParams.delete('wbScene');
      history.replaceState(null, '', url);
    }

    function switchScene(scene) {
      return fetch('/workbench/api/__fixture/scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scene: scene }),
      })
        .then(function (response) { return response.json(); })
        .then(function (payload) {
          if (payload.ok !== true) throw new Error('切换失败');
          clearSceneParam();
          publish(sceneState.scenes, String(payload.scene), '');
          refreshFacts();
          return payload;
        });
    }

    function loadScenes() {
      fetch('/workbench/api/__fixture/scenes')
        .then(function (response) { return response.json(); })
        .then(function (payload) {
          if (payload.ok !== true) return;
          publish(payload.scenes, payload.current, '');
          var wanted = new URLSearchParams(location.search).get('wbScene');
          if (wanted === null) return;
          if (wanted === payload.current) {
            clearSceneParam();
            return;
          }
          switchScene(wanted).catch(function () {
            publish(payload.scenes, payload.current, '切换失败');
          });
        })
        .catch(function () {
          publish([], 'real', '夹具插件没起来');
        });
    }

    function menuChildren(state, choose, expanded, toggle) {
      var groups = grouped(state.scenes);
      if (groups.length === 0) {
        return [React.createElement('div', { key: 'empty', style: { padding: '10px 8px', opacity: 0.6 } }, state.error === '' ? '场景还没读出来' : state.error)];
      }
      var children = groups.map(function (pair) {
        var name = pair[0];
        var items = pair[1];
        var open = expanded[name] === true;
        return React.createElement(
          'div',
          { key: name, style: { borderTop: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.08))' } },
          React.createElement(
            ui.Button,
            {
              variant: 'ghost',
              size: 'sm',
              'aria-expanded': open,
              style: { display: 'flex', width: '100%', justifyContent: 'space-between', padding: '7px 6px', marginTop: '2px' },
              onClick: function () { toggle(name); },
            },
            React.createElement(
              'span',
              { style: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 } },
              React.createElement(ui.IconChevronRightOutlineRegular, {
                size: 14,
                style: { flex: 'none', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s ease', opacity: 0.7 },
              }),
              React.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, name),
              React.createElement('span', { style: { opacity: 0.45, fontSize: 11 } }, String(items.length)),
            ),
          ),
          open
            ? items.map(function (scene) {
                return React.createElement(
                  ui.Button,
                  {
                    key: scene.id,
                    variant: scene.id === state.current ? 'secondary' : 'ghost',
                    size: 'sm',
                    style: { display: 'flex', width: '100%', justifyContent: 'flex-start', paddingLeft: '26px' },
                    onClick: function () { choose(scene.id); },
                  },
                  scene.label,
                );
              })
            : null,
        );
      });
      if (state.error !== '') {
        children.push(React.createElement('div', { key: 'error', style: { padding: '6px 8px', opacity: 0.7 } }, state.error));
      }
      return children;
    }

    function SceneMenuHost() {
      var state = React.useSyncExternalStore(subscribe, snapshot);
      var menu = React.useSyncExternalStore(subscribeMenu, function () { return menuState.version; });
      var rect = menu.rect;
      var expandedState = React.useState({});
      var expanded = expandedState[0];
      var setExpanded = expandedState[1];

      React.useEffect(function () { setExpanded({}); }, [rect]);

      function toggle(name) {
        setExpanded(function (current) {
          var next = {};
          for (var key in current) next[key] = current[key];
          if (next[name] === true) delete next[name];
          else next[name] = true;
          return next;
        });
      }

      function choose(id) {
        closeMenu();
        switchScene(id).catch(function () {
          publish(state.scenes, state.current, '切换失败');
        });
      }

      if (rect === null) return React.createElement('span', { style: { display: 'none' }, 'data-fixture-host': '' });
      var panel = React.createElement(
        'div',
        {
          'data-fixture-panel': '',
          style: {
            position: 'fixed',
            left: String(Math.max(16, Math.min(rect.right + 8, 520))) + 'px',
            top: String(Math.max(12, rect.top - 8)) + 'px',
            zIndex: 2147483002,
            width: '380px',
            maxHeight: '70vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            background: 'var(--dsw-alias-bg-layer-3, #22252b)',
            color: 'var(--dsw-alias-label-primary, #f4f6fb)',
            border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,.12))',
            boxShadow: '0 12px 32px rgba(0,0,0,.36)',
            font: '12px/1.4 ui-sans-serif,system-ui,sans-serif',
          },
        },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 6px', flex: 'none' } },
          React.createElement(
            'span',
            { style: { fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' } },
            '调试场景',
            React.createElement('span', { style: { opacity: 0.45, fontWeight: 400, fontSize: 11 } }, groupOf(state.current)),
          ),
          React.createElement(ui.Button, { size: 'sm', variant: 'ghost', onClick: closeMenu }, '关闭'),
        ),
        React.createElement('div', { style: { overflow: 'auto', padding: '0 8px 8px', flex: '1 1 auto', minHeight: 0 } }, menuChildren(state, choose, expanded, toggle)),
      );
      return ReactDOM.createPortal(panel, document.body);
    }

    function FixtureGlyph(props) {
      return React.createElement(ui.IconInspectOutlineRegular, { size: props.size ?? 16 });
    }

    wrapEventSource();

    function apply(ctx) {
      registerUnits(ctx);
      loadScenes();
      ctx.effect(
        function () {
          return ctx.slots.inject('sidebar.panellist', function () {
            return ctx.slots.register(
              { name: 'sidebar.panellist', id: 'fixture-scenes', label: '调试场景', order: 20 },
              FixtureGlyph,
            );
          });
        },
        'dev-fixtures: 场景入口',
      );
      if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
        new MutationObserver(function () { syncRowHint(); }).observe(document.body, { childList: true, subtree: true });
      }
      setTimeout(syncRowHint, 0);
      ctx.effect(
        function () {
          return ctx.slots.inject('sidebar.footer.action', function () {
            return ctx.slots.register(
              { name: 'sidebar.footer.action', id: 'fixture-scenes-host' },
              SceneMenuHost,
            );
          });
        },
        'dev-fixtures: 场景浮层',
      );
      if (typeof document.addEventListener === 'function') {
        document.addEventListener(
          'click',
          function (event) {
            var row = event.target && event.target.closest ? event.target.closest('button') : null;
            if (row === null || row.textContent.indexOf('调试场景') !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            if (menuState.rect !== null) {
              closeMenu();
              return;
            }
            var box = row.getBoundingClientRect();
            openMenu({ left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height });
          },
          true,
        );
      }
    }

    exports.apply = apply;
    exports.name = 'dsh-workbench-dev-plugin';
    exports.inject = ['slots'];
    return module.exports;
  },
});
