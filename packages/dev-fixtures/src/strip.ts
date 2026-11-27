import './strip.css';
import { REAL_SCENE, SCENES, sceneById } from './scenes';

const REAL_NOTE = '假宿主：选一个场景接管数据；「真实」透传给真宿主';

export interface StripHandle {
  update(current: string): void;
}

export function mountStrip(options: {
  readonly current: string;
  readonly onPick: (id: string) => void;
}): StripHandle {
  const wrap = document.createElement('div');
  wrap.className = 'wb-mockFloat';
  const strip = document.createElement('div');
  strip.className = 'wb-mockStrip';
  const note = document.createElement('span');
  note.className = 'wb-mockNote';
  strip.append(note);
  const buttons = new Map<string, HTMLButtonElement>();
  const add = (id: string, label: string): void => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'wb-mockChip';
    button.textContent = label;
    button.addEventListener('click', () => options.onPick(id));
    strip.append(button);
    buttons.set(id, button);
  };
  add(REAL_SCENE, '真实');
  for (const scene of SCENES) add(scene.id, scene.label);
  wrap.append(strip);

  const paint = (current: string): void => {
    for (const [id, button] of buttons) {
      button.classList.toggle('wb-mockChipOn', id === current);
    }
    note.textContent = sceneById(current)?.note ?? REAL_NOTE;
  };
  paint(options.current);

  const mount = (): void => {
    document.body.append(wrap);
  };
  if (document.body === null) document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();

  return { update: paint };
}
