window.__ModuleLoader__.load({
  id: '@dsh-workbench/dev-plugin',
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
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

    function menuChildren(state) {
      var groups = grouped(state.scenes);
      var children = groups.map(function (pair) {
        var name = pair[0];
        var items = pair[1];
        return React.createElement(
          'div',
          { key: name },
          React.createElement(
            'div',
            { style: { padding: '6px 8px 2px', opacity: 0.6, fontSize: 11, fontWeight: 600 } },
            name + ' · ' + String(items.length),
          ),
          items.map(function (scene) {
            return React.createElement(
              ui.Button,
              {
                key: scene.id,
                variant: scene.id === state.current ? 'secondary' : 'ghost',
                size: 'sm',
                style: { display: 'flex', width: '100%', justifyContent: 'flex-start' },
                onClick: function () { choose(scene.id); },
              },
              scene.label,
            );
          }),
        );
      });
      if (state.error !== '') {
        children.push(React.createElement('div', { key: 'error', style: { padding: '6px 8px', opacity: 0.7 } }, state.error));
      }
      return children;
    }

    function SceneMenuHost() {
      var state = React.useSyncExternalStore(subscribe, snapshot);
      var anchorState = React.useState(null);
      var openState = React.useState(false);
      var anchor = anchorState[0];
      var setAnchor = anchorState[1];
      var open = openState[0];
      var setOpen = openState[1];

      React.useEffect(function () {
        function onOpen(event) {
          setAnchor(event.detail.anchor);
          setOpen(true);
        }
        window.addEventListener('dsh-wb-fixture-open', onOpen);
        return function () { window.removeEventListener('dsh-wb-fixture-open', onOpen); };
      }, []);

      if (anchor === null) return null;
      return React.createElement(
        ui.Menu,
        {
          open: open,
          onClose: function () { setOpen(false); },
          portal: true,
          autoFocus: true,
          anchor: anchor,
        },
        menuChildren(state),
      );
    }

    function FixtureGlyph(props) {
      return React.createElement(ui.IconInspectOutlineRegular, { size: props.size ?? 16 });
    }

    wrapEventSource();

    function apply(ctx) {
      registerUnits(ctx);
      loadScenes();
      ctx.inject(['slots'], function () {
        ctx.effect(
          function () {
            var entry = ctx.slots.register(
              { name: 'sidebar.panellist', id: 'fixture-scenes', label: '调试场景', order: 20 },
              FixtureGlyph,
            );
            var host = ctx.slots.register(
              { name: 'sidebar.footer.action', id: 'fixture-scenes-host' },
              SceneMenuHost,
            );
            return function () {
              entry();
              host();
            };
          },
          'dev-fixtures: 场景入口',
        );
      });
      if (typeof document.addEventListener === 'function') {
        document.addEventListener(
          'click',
          function (event) {
            var row = event.target && event.target.closest ? event.target.closest('button') : null;
            if (row === null || row.textContent.indexOf('调试场景') !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            window.dispatchEvent(new CustomEvent('dsh-wb-fixture-open', { detail: { anchor: row } }));
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
