import type { Route } from './+types/api';
import { gameAction } from '../lib/game-action.server';

export function action({ request, params }: Route.ActionArgs) {
  return gameAction(request, params.gameId);
}
