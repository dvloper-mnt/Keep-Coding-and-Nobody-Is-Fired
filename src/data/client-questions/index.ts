import type { ClientQuestion } from '@/src/features/game/game-types';
import questions from './questions.json';

const clientQuestions: ClientQuestion[] = questions as ClientQuestion[];

export function loadClientQuestions(): ClientQuestion[] {
  return clientQuestions;
}

export function getClientQuestionById(id: string): ClientQuestion | undefined {
  return clientQuestions.find((q) => q.id === id);
}

export default clientQuestions;