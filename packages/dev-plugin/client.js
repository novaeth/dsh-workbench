window.__ModuleLoader__.load({
  id: '@dsh-workbench/dev-plugin',
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;

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

    wrapEventSource();

    function apply(ctx) {
      registerUnits(ctx);
      if (document.getElementById('dsh-wb-fixture-strip') !== null) return;
      var bar = document.createElement('div');
      bar.id = 'dsh-wb-fixture-strip';
      bar.style.cssText = [
        'position:fixed',
        'left:16px',
        'bottom:16px',
        'z-index:2147483000',
        'display:flex',
        'gap:8px',
        'align-items:center',
        'padding:8px 10px',
        'border-radius:10px',
        'background:rgba(20,22,26,.92)',
        'color:#f4f6fb',
        'font:12px/1.4 ui-sans-serif,system-ui,sans-serif',
        'box-shadow:0 8px 24px rgba(0,0,0,.28)',
      ].join(';');
      var label = document.createElement('span');
      label.textContent = '夹具';
      var trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.style.cssText = 'font:inherit;color:#111;background:#fff;border:0;border-radius:6px;padding:3px 8px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer';
      var status = document.createElement('span');
      status.style.cssText = 'opacity:.7;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      bar.append(label, trigger, status);
      document.body.appendChild(bar);

      var panel = document.createElement('div');
      panel.style.cssText = [
        'position:fixed',
        'left:16px',
        'bottom:64px',
        'z-index:2147483001',
        'width:380px',
        'max-height:60vh',
        'overflow:auto',
        'padding:8px',
        'border-radius:12px',
        'background:rgba(20,22,26,.97)',
        'color:#f4f6fb',
        'font:12px/1.4 ui-sans-serif,system-ui,sans-serif',
        'box-shadow:0 12px 32px rgba(0,0,0,.36)',
        'display:none',
      ].join(';');
      document.body.appendChild(panel);

      var sceneList = [];
      var currentScene = 'real';
      var GROUP_ORDER = ['模块市场', '面板', '添加模块', '启动页', '通用', '其它'];
      var GROUP_PREFIX = [
        ['模块市场', 'market-'],
        ['面板', 'panel-'],
        ['添加模块', 'add-'],
        ['启动页', 'boot-'],
      ];

      function groupOf(id) {
        if (id === 'real') return '通用';
        for (var index = 0; index < GROUP_PREFIX.length; index += 1) {
          if (id.indexOf(GROUP_PREFIX[index][1]) === 0) return GROUP_PREFIX[index][0];
        }
        return '其它';
      }

      function labelOf(id) {
        for (var index = 0; index < sceneList.length; index += 1) {
          if (sceneList[index].id === id) return sceneList[index].label;
        }
        return id;
      }

      function renderList() {
        panel.replaceChildren();
        var buckets = {};
        sceneList.forEach(function (scene) {
          var name = groupOf(scene.id);
          if (buckets[name] === undefined) buckets[name] = [];
          buckets[name].push(scene);
        });
        GROUP_ORDER.forEach(function (name) {
          var items = buckets[name];
          if (items === undefined || items.length === 0) return;
          var head = document.createElement('div');
          head.textContent = name + ' · ' + String(items.length);
          head.style.cssText = 'padding:6px 8px 2px;opacity:.6;font-weight:600';
          panel.appendChild(head);
          items.forEach(function (scene) {
            var row = document.createElement('button');
            row.type = 'button';
            row.textContent = scene.label;
            row.title = scene.id;
            row.style.cssText = [
              'display:block',
              'width:100%',
              'text-align:left',
              'border:0',
              'border-radius:6px',
              'padding:6px 8px',
              'background:' + (scene.id === currentScene ? 'rgba(90,130,255,.28)' : 'transparent'),
              'color:inherit',
              'font:inherit',
              'cursor:pointer',
              'overflow:hidden',
              'text-overflow:ellipsis',
              'white-space:nowrap',
            ].join(';');
            row.addEventListener('click', function () {
              closePanel();
              switchTo(scene.id);
            });
            panel.appendChild(row);
          });
        });
      }

      function openPanel() {
        renderList();
        panel.style.display = 'block';
      }

      function closePanel() {
        panel.style.display = 'none';
      }

      function show(scenes, current) {
        sceneList = scenes;
        currentScene = current;
        trigger.textContent = '夹具：' + labelOf(current);
        status.textContent = current === 'real' ? '接管已关闭' : '';
        if (panel.style.display === 'block') renderList();
      }

      function desiredScene() {
        return new URLSearchParams(location.search).get('wbScene');
      }

      function switchTo(scene) {
        status.textContent = '切换中…';
        fetch('/workbench/api/__fixture/scene', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scene: scene }),
        })
          .then(function (response) { return response.json(); })
          .then(function (payload) {
            if (payload.ok !== true) {
              status.textContent = '切换失败';
              return;
            }
            clearSceneParam();
            currentScene = String(payload.scene);
            trigger.textContent = '夹具：' + labelOf(currentScene);
            status.textContent = currentScene === 'real' ? '接管已关闭' : '';
            refreshFacts();
          })
          .catch(function () {
            status.textContent = '切换失败';
          });
      }

      function clearSceneParam() {
        var url = new URL(location.href);
        if (!url.searchParams.has('wbScene')) return;
        url.searchParams.delete('wbScene');
        history.replaceState(null, '', url);
      }

      function load() {
        fetch('/workbench/api/__fixture/scenes')
          .then(function (response) { return response.json(); })
          .then(function (payload) {
            if (payload.ok !== true) return;
            show(payload.scenes, payload.current);
            var wanted = desiredScene();
            if (wanted === null) return;
            if (wanted === payload.current) {
              clearSceneParam();
              return;
            }
            switchTo(wanted);
          })
          .catch(function () {
            status.textContent = '夹具插件没起来';
          });
      }

      trigger.addEventListener('click', function () {
        if (panel.style.display === 'block') closePanel();
        else openPanel();
      });

      if (typeof document.addEventListener === 'function') {
        document.addEventListener('click', function (event) {
          if (panel.style.display !== 'block') return;
          if (bar.contains(event.target) || panel.contains(event.target)) return;
          closePanel();
        });
        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') closePanel();
        });
      }

      load();
    }

    exports.apply = apply;
    exports.name = 'dsh-workbench-dev-plugin';
    exports.inject = [];
    return module.exports;
  },
});
