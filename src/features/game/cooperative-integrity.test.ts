import { describe, expect, it } from 'vitest';
import {
  checkCooperativeIntegrity,
  hasCooperativeIntegrity,
} from './cooperative-integrity';
import { makeChallenge, makeStep } from './testing/fixtures';

// ---------------------------------------------------------------------------
// hasCooperativeIntegrity detects the "the hint IS the answer" pattern: a
// Helper rule/knowledge that leaks the concrete solution symbol, letting the
// Helper dictate the answer without the Coder describing the symptom.
// Two signals (see cooperative-prompt-integrity/design.md D2):
//   D2.a — a rule/knowledge contains the text of options[correct_answer]
//   D2.b — a rule/knowledge names the symbol that changes between code and
//          success_state.code_patch (the corrected identifier)
// It must NOT reject legitimate theory that only mentions the framework name
// or an HTTP error code.
// ---------------------------------------------------------------------------

describe('hasCooperativeIntegrity — leak of the correct option (D2.a)', () => {
  it('rejects a step whose rule literally contains the correct option text', () => {
    const step = makeStep({
      options: [
        'El método index no existe en LoginController',
        'El controlador no está importado',
        'Error de base de datos',
        'La ruta está mal definida',
      ],
      correct_answer: 0,
      helper_view: {
        rules: [
          // This IS the correct option verbatim — served on a platter.
          'El método index no existe en LoginController',
        ],
        knowledge: ['El front de la demo envía POST a /login'],
      },
    });
    const challenge = makeChallenge({ steps: [step] });

    expect(hasCooperativeIntegrity(challenge)).toBe(false);
  });

  it('rejects when the leak is in knowledge instead of rules', () => {
    const step = makeStep({
      options: [
        'Falta await en la llamada asíncrona',
        'El tipo de retorno es incorrecto',
        'La variable no está declarada',
        'El import es circular',
      ],
      correct_answer: 0,
      helper_view: {
        rules: ['Una promesa sin await devuelve el objeto Promise, no su valor resuelto.'],
        knowledge: ['Falta await en la llamada asíncrona'],
      },
    });
    const challenge = makeChallenge({ steps: [step] });

    expect(hasCooperativeIntegrity(challenge)).toBe(false);
  });
});

describe('hasCooperativeIntegrity — leak of the diff symbol (D2.b)', () => {
  it('rejects a rule that names the corrected identifier from the code→patch diff', () => {
    const step = makeStep({
      coder_view: {
        code: "Route::post('/login', [LoginController::class, 'index']);",
        error: '500 Internal Server Error',
      },
      success_state: {
        // The fix changes `index` → `login`. `login` is the corrected symbol.
        code_patch: "Route::post('/login', [LoginController::class, 'login']);",
      },
      options: [
        'El método invocado no existe en el controlador',
        'El controlador no está importado',
        'Error de base de datos',
        'La ruta está mal definida',
      ],
      correct_answer: 0,
      helper_view: {
        // Names the corrected symbol `login` — tells the Coder what to put.
        rules: ['El método correcto es login, no index.'],
        knowledge: ['El front de la demo llama a esa ruta.'],
      },
    });
    const challenge = makeChallenge({ steps: [step] });

    expect(hasCooperativeIntegrity(challenge)).toBe(false);
  });

  it('rejects a knowledge that leaks the corrected HTTP verb from the diff', () => {
    const step = makeStep({
      coder_view: {
        code: "Route::get('/logout', [LogoutController::class, 'logout']);",
        error: '405 Method Not Allowed',
      },
      success_state: {
        // The fix changes `get` → `post`. `post` is the corrected symbol.
        code_patch: "Route::post('/logout', [LogoutController::class, 'logout']);",
      },
      options: [
        'El verbo HTTP de la ruta no coincide con el de la petición',
        'Falta importar el controlador',
        'El método no existe',
        'Error de sesión',
      ],
      correct_answer: 0,
      helper_view: {
        rules: ['Un 405 aparece cuando el verbo HTTP no coincide con el registrado.'],
        // Leaks the corrected verb `post`.
        knowledge: ['La ruta de logout debe registrarse como post.'],
      },
    });
    const challenge = makeChallenge({ steps: [step] });

    expect(hasCooperativeIntegrity(challenge)).toBe(false);
  });
});

describe('hasCooperativeIntegrity — legitimate theory passes (no false positives)', () => {
  it('accepts abstract theory that mentions the framework and error code but not the solution symbol', () => {
    const step = makeStep({
      coder_view: {
        code: "Route::post('/login', [LoginController::class, 'index']);",
        error: '500 Internal Server Error',
      },
      success_state: {
        code_patch: "Route::post('/login', [LoginController::class, 'login']);",
      },
      options: [
        'El método invocado no existe en el controlador',
        'El controlador no está importado',
        'Error de base de datos',
        'La ruta está mal definida',
      ],
      correct_answer: 0,
      helper_view: {
        rules: [
          // Abstract theory: mentions Laravel + 500, never names `login`/`index`.
          'En Laravel, un 500 en runtime (no en arranque) suele ser un método invocado que no existe en el controlador.',
          'El 500 genérico no dice qué ruta falla: hay que preguntar qué método invoca la ruta rota.',
        ],
        knowledge: [
          // Domain fact that does not reveal the diagnosis by itself.
          'El front de la demo está golpeando la ruta de autenticación en este momento.',
        ],
      },
    });
    const challenge = makeChallenge({ steps: [step] });

    expect(hasCooperativeIntegrity(challenge)).toBe(true);
  });

  it('does not reject theory just because it repeats a common framework token present in the diff', () => {
    // `Route` appears in both code and patch (unchanged) — it is NOT the
    // corrected symbol, so mentioning it in theory must not trip the detector.
    const step = makeStep({
      coder_view: {
        code: "Route::get('/profile', [ProfileController::class, 'show']);",
        error: '405 Method Not Allowed',
      },
      success_state: {
        code_patch: "Route::patch('/profile', [ProfileController::class, 'show']);",
      },
      options: [
        'El verbo HTTP no coincide con la operación esperada',
        'Falta el controlador',
        'El método show no existe',
        'La ruta duplica otra',
      ],
      correct_answer: 0,
      helper_view: {
        rules: [
          'Las rutas de actualización parcial suelen registrarse con un verbo distinto al de lectura.',
          'Un 405 indica desajuste entre el verbo registrado y el de la petición.',
        ],
        knowledge: ['La demo intenta actualizar el perfil, no leerlo.'],
      },
    });
    const challenge = makeChallenge({ steps: [step] });

    expect(hasCooperativeIntegrity(challenge)).toBe(true);
  });
});

describe('hasCooperativeIntegrity — normalization', () => {
  it('detects the corrected symbol regardless of case and accents', () => {
    const step = makeStep({
      coder_view: {
        code: 'const resultado = obtenerDatos();',
        error: 'undefined is not a function',
      },
      success_state: {
        code_patch: 'const resultado = obtenerDatosAsync();',
      },
      options: [
        'Se llama a una función que no existe',
        'La variable es nula',
        'Falta un import',
        'El tipo es incorrecto',
      ],
      correct_answer: 0,
      helper_view: {
        // Different capitalization of the corrected symbol still leaks it.
        rules: ['Deberías llamar a OBTENERDATOSASYNC en su lugar.'],
        knowledge: ['El módulo expone una variante asíncrona.'],
      },
    });
    const challenge = makeChallenge({ steps: [step] });

    expect(hasCooperativeIntegrity(challenge)).toBe(false);
  });
});

describe('hasCooperativeIntegrity — whole challenge', () => {
  it('rejects the challenge if ANY step leaks, even when others are clean', () => {
    const cleanStep = makeStep({
      step: 1,
      coder_view: { code: 'a();', error: 'e1' },
      success_state: { code_patch: 'b();' },
      options: ['La función a no existe', 'x', 'y', 'z'],
      correct_answer: 0,
      helper_view: {
        rules: ['Una función no declarada lanza ReferenceError en tiempo de ejecución.'],
        knowledge: ['El módulo se cargó parcialmente.'],
      },
    });
    const leakyStep = makeStep({
      step: 2,
      options: ['La función b no existe', 'x', 'y', 'z'],
      correct_answer: 0,
      helper_view: {
        rules: ['La función b no existe'],
        knowledge: ['Contexto del dominio.'],
      },
    });
    const challenge = makeChallenge({ steps: [cleanStep, leakyStep] });

    expect(hasCooperativeIntegrity(challenge)).toBe(false);
  });

  it('accepts a multi-step challenge where every step keeps its integrity', () => {
    const step1 = makeStep({
      step: 1,
      coder_view: { code: 'foo();', error: 'ReferenceError: foo' },
      success_state: { code_patch: 'bar();' },
      options: ['La función invocada no está definida', 'x', 'y', 'z'],
      correct_answer: 0,
      helper_view: {
        rules: ['Invocar un identificador no declarado lanza ReferenceError.'],
        knowledge: ['El bundle omitió un módulo en esta build.'],
      },
    });
    const step2 = makeStep({
      step: 2,
      coder_view: { code: 'bar();', error: 'TypeError: not a function' },
      success_state: { code_patch: 'bar.run();' },
      options: ['Se invoca un objeto como si fuera función', 'x', 'y', 'z'],
      correct_answer: 0,
      helper_view: {
        rules: ['Llamar a un objeto que no es función produce un TypeError.'],
        knowledge: ['El módulo exporta un objeto con métodos, no una función.'],
      },
    });
    const challenge = makeChallenge({ steps: [step1, step2] });

    expect(hasCooperativeIntegrity(challenge)).toBe(true);
  });
});

describe('checkCooperativeIntegrity — reason for logging', () => {
  it('returns ok:true for a clean challenge', () => {
    const step = makeStep({
      coder_view: { code: 'foo();', error: 'ReferenceError' },
      success_state: { code_patch: 'bar();' },
      options: ['El identificador invocado no existe', 'x', 'y', 'z'],
      correct_answer: 0,
      helper_view: {
        rules: ['Un identificador no declarado lanza ReferenceError.'],
        knowledge: ['Falta un módulo en el bundle.'],
      },
    });
    const result = checkCooperativeIntegrity(makeChallenge({ steps: [step] }));

    expect(result.ok).toBe(true);
  });

  it('returns ok:false with the failing step number and a reason', () => {
    const step = makeStep({
      step: 3,
      options: ['La respuesta filtrada', 'x', 'y', 'z'],
      correct_answer: 0,
      helper_view: {
        rules: ['La respuesta filtrada'],
        knowledge: ['Contexto.'],
      },
    });
    const result = checkCooperativeIntegrity(makeChallenge({ steps: [step] }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe(3);
      expect(result.reason).toBeTypeOf('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});
