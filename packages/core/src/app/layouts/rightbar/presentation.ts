import { RIGHTBAR_FULLSCREEN_WIDTH } from '@dsh-workbench/shared';

export interface RightbarPresentation {
  readonly track: boolean;
  readonly fullscreen: boolean;
}

export function rightbarPresentation(input: {
  shown: boolean;
  viewportWidth: number;
  canShow: boolean;
}): RightbarPresentation {
  const fullscreen =
    input.shown && (input.viewportWidth < RIGHTBAR_FULLSCREEN_WIDTH || !input.canShow);
  return { fullscreen, track: input.shown && !fullscreen };
}
