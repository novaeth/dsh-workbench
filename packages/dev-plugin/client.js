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
      var select = document.createElement('select');
      select.style.cssText = 'font:inherit;color:#111;background:#fff;border-radius:6px;border:0;padding:2px 6px;max-width:220px';
      var status = document.createElement('span');
      status.style.cssText = 'opacity:.7;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      bar.append(label, select, status);
      document.body.appendChild(bar);

      function show(scenes, current) {
        select.replaceChildren();
        scenes.forEach(function (scene) {
          var option = document.createElement('option');
          option.value = scene.id;
          option.textContent = scene.label;
          option.selected = scene.id === current;
          select.appendChild(option);
        });
        status.textContent = current === 'real' ? '接管已关闭' : '当前：' + current;
      }

      function desiredScene() {
        return new URLSearchParams(location.search).get('wbScene');
      }

      function switchTo(scene, reloadAfter) {
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
            status.textContent = '已切到：' + String(payload.scene);
            if (reloadAfter) location.reload();
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
              sessionStorage.removeItem('wb-fixture-reload');
              clearSceneParam();
              return;
            }
            if (sessionStorage.getItem('wb-fixture-reload') === wanted) return;
            sessionStorage.setItem('wb-fixture-reload', wanted);
            switchTo(wanted, true)
          })
          .catch(function () {
            status.textContent = '夹具插件没起来';
          });
      }

      select.addEventListener('change', function () {
        switchTo(select.value, true);
      });

      load();
    }

    exports.apply = apply;
    exports.name = 'dsh-workbench-dev-plugin';
    exports.inject = [];
    return module.exports;
  },
});
