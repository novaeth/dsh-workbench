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
      syncRowHint();
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
      var order = ['模块市场', '面板', '添加模块', '启动页', '其它'];
      var buckets = {};
      scenes.forEach(function (scene) {
        if (scene.id === 'real') return;
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

    function ensureRowHintStyle() {
      if (typeof document === 'undefined' || document.querySelector('style[data-fixture-hint-style]') !== null) return;
      var style = document.createElement('style');
      style.setAttribute('data-fixture-hint-style', '');
      style.textContent =
        'button[data-fixture-hint]::after{content:attr(data-fixture-hint);flex:none;margin-left:auto;padding-left:8px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.55;font-size:11px}';
      document.head.appendChild(style);
    }

    function syncRowHint() {
      if (typeof document === 'undefined') return;
      var row = document.querySelector('button[aria-label^="调试场景"]');
      if (row === null) return;
      var text = sceneState.current === 'real' ? '真宿主' : groupOf(sceneState.current) + ' · ' + labelOf(sceneState.current);
      if (row.getAttribute('data-fixture-hint') !== text) row.setAttribute('data-fixture-hint', text);
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
          if (typeof location !== 'undefined' && typeof location.reload === 'function') {
            location.reload();
            return payload;
          }
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
                var current = scene.id === state.current;
                return React.createElement(
                  ui.Button,
                  {
                    key: scene.id,
                    variant: current ? 'secondary' : 'ghost',
                    size: 'sm',
                    'aria-current': current ? 'true' : undefined,
                    style: {
                      display: 'flex',
                      width: '100%',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-start',
                      height: 'auto',
                      paddingTop: '5px',
                      paddingBottom: '5px',
                      paddingLeft: '26px',
                      ...(current ? { fontWeight: 600 } : {}),
                    },
                    'data-current-scene': current ? '' : undefined,
                    onClick: function () { choose(scene.id); },
                  },
                  React.createElement(
                    'span',
                    { style: { display: 'flex', alignItems: 'flex-start', gap: '6px', minWidth: 0, textAlign: 'left' } },
                    current ? React.createElement(ui.IconCheckOutlineRegular, { size: 14, style: { flex: 'none', marginTop: '2px' } }) : null,
                    React.createElement(
                      'span',
                      { style: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
                      React.createElement(
                        'span',
                        { style: { whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 } },
                        scene.label,
                      ),
                      scene.note
                        ? React.createElement(
                            'span',
                            { style: { opacity: 0.5, fontSize: 11, lineHeight: 1.35, whiteSpace: 'normal' } },
                            scene.note,
                          )
                        : null,
                    ),
                  ),
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
      var panelRef = React.useRef(null);
      var contentRef = React.useRef(null);
      var scrolledFor = React.useRef(null);

      React.useEffect(function () {
        if (rect === null) {
          scrolledFor.current = null;
          return undefined;
        }
        if (scrolledFor.current === rect) return undefined;
        var box = contentRef.current;
        var row = box === null ? null : box.querySelector('[data-current-scene]');
        if (box === null || row === null) return undefined;
        scrolledFor.current = rect;
        var rowRect = row.getBoundingClientRect();
        var boxRect = box.getBoundingClientRect();
        var top = box.scrollTop + (rowRect.top - boxRect.top) - (box.clientHeight - rowRect.height) / 2;
        box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        return undefined;
      }, [rect, expanded, state.current, state.scenes]);

      React.useEffect(function () {
        if (sceneState.current === 'real') return;
        var currentGroup = groupOf(sceneState.current);
        setExpanded(function (current) {
          if (current[currentGroup] === true) return current;
          var next = {};
          for (var key in current) next[key] = current[key];
          next[currentGroup] = true;
          return next;
        });
      }, [sceneState.current]);

      React.useEffect(function () {
        if (rect === null) return undefined;
        function onPointerDown(event) {
          var panel = panelRef.current;
          var target = event.target;
          if (panel !== null && panel.contains(target)) return;
          if (target !== null && target.closest && target.closest('button[aria-label^="调试场景"]')) return;
          closeMenu();
        }
        function onKeyDown(event) {
          if (event.key === 'Escape') closeMenu();
        }
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return function () {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [rect]);

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
        ui.MenuSurface,
        {
          ref: panelRef,
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
            padding: 0,
          },
        },
        React.createElement(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px 6px', flex: 'none' } },
          React.createElement(
            'span',
            { style: { fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' } },
            '调试场景',
            React.createElement('span', { style: { opacity: 0.45, fontWeight: 400, fontSize: 11 } }, state.current === 'real' ? '真宿主' : groupOf(state.current)),
          ),
          React.createElement(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '4px' } },
            React.createElement(ui.Button, { size: 'sm', variant: 'ghost', onClick: function () { choose('real'); } }, '重置'),
            React.createElement(ui.Button, { size: 'sm', variant: 'ghost', onClick: closeMenu }, '关闭'),
          ),
        ),
        React.createElement('div', { ref: contentRef, style: { overflow: 'auto', padding: '0 8px 8px', flex: '1 1 auto', minHeight: 0 } }, menuChildren(state, choose, expanded, toggle)),
      );
      return ReactDOM.createPortal(panel, document.body);
    }

    function FixtureGlyph(props) {
      return React.createElement(ui.IconInspectOutlineRegular, { size: props.size ?? 16 });
    }

    wrapEventSource();

    function apply(ctx) {
      registerUnits(ctx);
      ensureRowHintStyle();
      loadScenes();
      ctx.effect(
        function () {
          var off = ctx.slots.subscribe('sidebar.panellist', syncRowHint);
          var dispose = ctx.slots.inject('sidebar.panellist', function () {
            return ctx.slots.register(
              { name: 'sidebar.panellist', id: 'fixture-scenes', label: '调试场景', order: 20 },
              FixtureGlyph,
            );
          });
          return function () {
            off();
            dispose();
          };
        },
        'dev-fixtures: 场景入口',
      );
      setTimeout(syncRowHint, 0);
      var hintTimer = setInterval(syncRowHint, 500);
      ctx.effect(function () {
        return function () { clearInterval(hintTimer); };
      }, 'dev-fixtures: 行回显');
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
        function onSceneRowClick(event) {
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
        }
        document.addEventListener('click', onSceneRowClick, true);
        ctx.effect(function () {
          return function () { document.removeEventListener('click', onSceneRowClick, true); };
        }, 'dev-fixtures: 场景入口点击');
      }
    }

    exports.apply = apply;
    exports.name = 'dsh-workbench-dev-plugin';
    exports.inject = ['slots'];
    return module.exports;
  },
});
