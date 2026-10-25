'use strict';

const assert = require('node:assert/strict');
const { Calculator, CalcError, createMeowPlayer, evaluate, formatNumber, keyToAction } = require('./script.js');

let passed = 0;

function test(name, run) {
  try {
    run();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

test('respeta precedencia y paréntesis', () => {
  assert.equal(evaluate('2+3×4'), 14);
  assert.equal(evaluate('2×(3+4)'), 14);
});

test('redondea resultados decimales sin ruido binario', () => {
  assert.equal(evaluate('0.1+0.2'), 0.3);
});

test('calcula funciones trigonométricas en grados y radianes', () => {
  assert.equal(evaluate('sin(30)'), 0.5);
  assert.equal(evaluate('sin(π/2)', { angleMode: 'RAD' }), 1);
});

test('calcula funciones científicas, potencias y raíces', () => {
  assert.equal(evaluate('sqrt(81)'), 9);
  assert.equal(evaluate('log(1000)'), 3);
  assert.equal(evaluate('5!'), 120);
  assert.equal(evaluate('2^8'), 256);
  assert.equal(evaluate('3ʸ√27'), 3);
});

test('rechaza operaciones fuera del dominio o indefinidas', () => {
  assert.throws(() => evaluate('1÷0'), CalcError);
  assert.throws(() => evaluate('sqrt(−1)'), CalcError);
  assert.throws(() => evaluate('tan(90)'), CalcError);
});

test('formatea números pequeños en notación científica', () => {
  assert.equal(formatNumber(0.0000001), '1E-7');
});

test('la calculadora procesa botones, vista previa e igualdad', () => {
  const calc = new Calculator();
  calc.press('digit', '2');
  calc.press('op', '+');
  calc.press('digit', '3');
  calc.press('op', '×');
  calc.press('digit', '4');

  assert.equal(calc.getView().main, '14');
  calc.press('equals');
  assert.equal(calc.getView().main, '14');
  assert.equal(calc.getView().expression, '2+3×4 =');
});

test('el modo angular puede alternarse desde el estado de la calculadora', () => {
  const calc = new Calculator();
  calc.press('mode', 'RAD');
  calc.press('fn', 'sin');
  calc.press('digit', '1');
  calc.press('op', '÷');
  calc.press('digit', '2');
  calc.press('const', 'π');
  calc.press('equals');

  assert.equal(calc.angleMode, 'RAD');
  assert.equal(calc.getView().main, '1');
});

test('mapea teclas físicas a acciones', () => {
  assert.deepEqual(keyToAction('7'), ['digit', '7']);
  assert.deepEqual(keyToAction('Enter'), ['equals']);
  assert.deepEqual(keyToAction('d'), ['mode', 'toggle']);
  assert.equal(keyToAction('F1'), null);
});

test('reproduce un maullido sintetizado por cada llamada y reutiliza el audio', () => {
  const contexts = [];
  class AudioParam {
    setValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class AudioNode {
    constructor() {
      this.frequency = new AudioParam();
      this.gain = new AudioParam();
      this.started = false;
      this.stopped = false;
    }
    connect() {}
    disconnect() {}
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  class AudioContext {
    constructor() {
      this.currentTime = 1;
      this.destination = new AudioNode();
      this.state = 'suspended';
      this.oscillators = [];
      this.resumes = 0;
      contexts.push(this);
    }
    createGain() { return new AudioNode(); }
    createBiquadFilter() { return new AudioNode(); }
    createOscillator() {
      const oscillator = new AudioNode();
      this.oscillators.push(oscillator);
      return oscillator;
    }
    resume() {
      this.resumes += 1;
      this.state = 'running';
      return Promise.resolve();
    }
  }

  const playMeow = createMeowPlayer({ AudioContext });
  playMeow();
  playMeow();

  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].resumes, 1);
  assert.equal(contexts[0].oscillators.length, 4);
  assert.ok(contexts[0].oscillators.every((oscillator) => oscillator.started && oscillator.stopped));
});

if (process.exitCode !== 1) {
  console.log(`\n${passed} pruebas aprobadas.`);
}
