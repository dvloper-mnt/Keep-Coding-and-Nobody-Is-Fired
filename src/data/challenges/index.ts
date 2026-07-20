import type { Challenge } from '@/src/features/game/game-types';
import loginChaos from './login-chaos.json';

const challenges: Challenge[] = [loginChaos as Challenge];

export function loadChallenges(): Challenge[] {
  return challenges;
}

export function getChallengeById(id: string): Challenge | undefined {
  return challenges.find((c) => c.id === id);
}

export default challenges;