import { describe, expect, it } from 'vitest';
import {
  CLIENT_QUESTION_CONFIG,
  CLIENT_QUESTION_CORRECT_MESSAGE,
} from '@/src/lib/constants';
import { submitClientQuestionAnswer } from './client-question-engine';
import type { GameSession } from './game-types';
import { makeClientQuestion, makeClientQuestionState, makeSession } from './testing/fixtures';

// ---------------------------------------------------------------------------
// Helper: session with a specific active question
// ---------------------------------------------------------------------------

function makeSessionWithActiveQuestion(
  questionId: string,
  overrides: Partial<GameSession> = {},
): GameSession {
  return makeSession({
    clientQuestions: makeClientQuestionState({ activeQuestionId: questionId }),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// R8 — submitClientQuestionAnswer
// ---------------------------------------------------------------------------

describe('submitClientQuestionAnswer', () => {
  // R8.1 — guard: status is not 'playing'
  describe('when game status is not playing', () => {
    it.each<GameSession['status']>(['victory', 'defeat', 'idle'])(
      'returns success:false with "La partida ya terminó." and does NOT mutate remainingTime when status is %s',
      (status) => {
        const question = makeClientQuestion({ id: 'q-001', correct_answer: 0 });
        const session = makeSessionWithActiveQuestion('q-001', {
          status,
          remainingTime: 100,
        });

        const { session: updatedSession, response } = submitClientQuestionAnswer(
          session,
          question,
          0, // would be correct, but game is over
        );

        expect(response.success).toBe(false);
        expect(response.message).toBe('La partida ya terminó.');
        // Time must NOT change
        expect(updatedSession.remainingTime).toBe(100);
        expect(response.remainingTime).toBe(100);
        // Session returned by reference (no mutation)
        expect(updatedSession).toBe(session);
      },
    );
  });

  // R8.2 — guard: no active question matching the submitted question
  describe('when there is no active question matching the submitted one', () => {
    it('returns success:false with "No hay una consulta activa…" and does NOT mutate remainingTime', () => {
      const question = makeClientQuestion({ id: 'q-different' });
      // Session has a DIFFERENT active question id
      const session = makeSessionWithActiveQuestion('q-other-id', { remainingTime: 80 });

      const { session: updatedSession, response } = submitClientQuestionAnswer(
        session,
        question,
        0,
      );

      expect(response.success).toBe(false);
      expect(response.message).toBe('No hay una consulta activa del cliente.');
      expect(updatedSession.remainingTime).toBe(80);
      expect(response.remainingTime).toBe(80);
      expect(updatedSession).toBe(session);
    });

    it('returns success:false when activeQuestionId is null (no active question at all)', () => {
      const question = makeClientQuestion({ id: 'q-001' });
      // Default makeSession has activeQuestionId: null
      const session = makeSession({ remainingTime: 60 });

      const { response } = submitClientQuestionAnswer(session, question, 0);

      expect(response.success).toBe(false);
      expect(response.message).toBe('No hay una consulta activa del cliente.');
    });
  });

  // R8.3 — correct answer: bonus time, clear activeQuestionId, add to answeredQuestionIds
  describe('when answer is correct', () => {
    it('adds correctBonusSeconds to remainingTime', () => {
      const question = makeClientQuestion({ id: 'q-bonus', correct_answer: 1 });
      const session = makeSessionWithActiveQuestion('q-bonus', { remainingTime: 100 });

      const { session: updated, response } = submitClientQuestionAnswer(session, question, 1);

      expect(response.success).toBe(true);
      expect(updated.remainingTime).toBe(100 + CLIENT_QUESTION_CONFIG.correctBonusSeconds);
      expect(response.remainingTime).toBe(100 + CLIENT_QUESTION_CONFIG.correctBonusSeconds);
    });

    it('clears activeQuestionId after a correct answer', () => {
      const question = makeClientQuestion({ id: 'q-clear', correct_answer: 2 });
      const session = makeSessionWithActiveQuestion('q-clear');

      const { session: updated } = submitClientQuestionAnswer(session, question, 2);

      expect(updated.clientQuestions.activeQuestionId).toBeNull();
    });

    it('adds the question id to answeredQuestionIds', () => {
      const question = makeClientQuestion({ id: 'q-answered', correct_answer: 0 });
      const session = makeSessionWithActiveQuestion('q-answered');

      const { session: updated } = submitClientQuestionAnswer(session, question, 0);

      expect(updated.clientQuestions.answeredQuestionIds).toContain('q-answered');
    });

    it('returns the correct bonus value in the response', () => {
      const question = makeClientQuestion({ id: 'q-resp', correct_answer: 3 });
      const session = makeSessionWithActiveQuestion('q-resp');

      const { response } = submitClientQuestionAnswer(session, question, 3);

      expect(response.bonus).toBe(CLIENT_QUESTION_CONFIG.correctBonusSeconds);
      expect(response.message).toBe(CLIENT_QUESTION_CORRECT_MESSAGE);
      expect(response.activeClientQuestion).toBeNull();
    });
  });

  // R8.4 — wrong answer: penalty time, question stays active
  describe('when answer is wrong', () => {
    it('subtracts wrongPenaltySeconds from remainingTime', () => {
      const question = makeClientQuestion({ id: 'q-penalty', correct_answer: 0 });
      const session = makeSessionWithActiveQuestion('q-penalty', { remainingTime: 50 });

      const { session: updated, response } = submitClientQuestionAnswer(
        session,
        question,
        3, // wrong
      );

      expect(response.success).toBe(false);
      expect(updated.remainingTime).toBe(50 - CLIENT_QUESTION_CONFIG.wrongPenaltySeconds);
      expect(response.remainingTime).toBe(50 - CLIENT_QUESTION_CONFIG.wrongPenaltySeconds);
    });

    it('returns the penalty value in the response', () => {
      const question = makeClientQuestion({ id: 'q-pen-resp', correct_answer: 1 });
      const session = makeSessionWithActiveQuestion('q-pen-resp', { remainingTime: 40 });

      const { response } = submitClientQuestionAnswer(session, question, 2);

      expect(response.penalty).toBe(CLIENT_QUESTION_CONFIG.wrongPenaltySeconds);
    });

    it('does NOT clear activeQuestionId — question remains active', () => {
      const question = makeClientQuestion({ id: 'q-stays', correct_answer: 0 });
      const session = makeSessionWithActiveQuestion('q-stays');

      const { session: updated } = submitClientQuestionAnswer(session, question, 3);

      // activeQuestionId must remain — question is still pending
      expect(updated.clientQuestions.activeQuestionId).toBe('q-stays');
    });

    it('decrements helper lives on wrong answer', () => {
      const question = makeClientQuestion({ id: 'q-lives', correct_answer: 0 });
      const session = makeSessionWithActiveQuestion('q-lives', { helperLives: 3 });

      const { session: updated, response } = submitClientQuestionAnswer(session, question, 2);

      expect(updated.helperLives).toBe(2);
      expect(response.livesRemaining).toBe(2);
      expect(response.lifeLost).toBe(true);
    });

    it('triggers defeat with helper_lives after the third wrong answer', () => {
      const question = makeClientQuestion({ id: 'q-no-lives', correct_answer: 0 });
      const session = makeSessionWithActiveQuestion('q-no-lives', { helperLives: 1 });

      const { session: updated, response } = submitClientQuestionAnswer(session, question, 2);

      expect(updated.status).toBe('defeat');
      expect(updated.helperLives).toBe(0);
      expect(updated.defeatReason).toBe('helper_lives');
      expect(response.status).toBe('defeat');
    });

    it('clamps remainingTime to 0 and triggers defeat when penalty exceeds remaining time', () => {
      const question = makeClientQuestion({ id: 'q-lethal', correct_answer: 0 });
      const session = makeSessionWithActiveQuestion('q-lethal', { remainingTime: 3, helperLives: 3 });

      const { session: updated, response } = submitClientQuestionAnswer(
        session,
        question,
        2, // wrong
      );

      expect(updated.remainingTime).toBe(0);
      expect(updated.status).toBe('defeat');
      expect(response.status).toBe('defeat');
    });
  });
});
