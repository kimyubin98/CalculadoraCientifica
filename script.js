/* ==========================================================================
   Calculadora científica — script.js
   --------------------------------------------------------------------------
   Capas (de abajo hacia arriba):
     1. Motor matemático  : tokenizador + parser recursivo descendente.
                            NO usa eval() ni new Function().
     2. Calculator        : estado y reglas de entrada (sin DOM, testeable).
     3. keyToAction       : mapa del teclado físico a acciones.
     4. bootUI            : conexión con el DOM (botones, teclado, tema).

   Límites numéricos documentados:
     - Precisión: 15 dígitos significativos en funciones y resultado final;
       la aritmética intermedia se redondea a 16 para eliminar el ruido
       binario sin degradar ángulos (0.1 + 0.2 = 0.3, tan(π/4) = 1).
     - Factorial: enteros 0 … 170 (171! excede el máximo de un double).
     - Longitud de la expresión: 200 caracteres desde la interfaz.
     - Números ≥ 1e15 o < 1e-6 se muestran en notación científica (1.5E15).
   ========================================================================== */
(() => {
  'use strict';

  const LIMITS = Object.freeze({
    MAX_EXPRESSION_LENGTH: 512, // límite duro del motor
    MAX_INPUT_LENGTH: 200,      // límite de la interfaz
    MAX_FACTORIAL: 170,
    SIGNIFICANT_DIGITS: 15,       // funciones y resultado final
    INTERMEDIATE_DIGITS: 16,      // aritmética intermedia (conserva ángulos como π/4)
  });

  /* ======================================================================
     1. MOTOR MATEMÁTICO
     ====================================================================== */

  class CalcError extends Error {
    constructor(message) {
      super(message);
      this.name = 'CalcError';
    }
  }

  const FUNCTION_NAMES = ['asin', 'acos', 'atan', 'sqrt', 'sin', 'cos', 'tan', 'log', 'ln', 'abs'];
  const NAMED_TOKENS = [...FUNCTION_NAMES, 'pi', 'e'];
  const DEG_TO_RAD = Math.PI / 180;

  /** Unifica símbolos tipográficos y elimina espacios. */
  function normalize(text) {
    return text
      .replace(/[−–—]/g, '-')
      .replace(/[×·]/g, '*')
      .replace(/÷/g, '/')
      .replace(/\s+/g, '');
  }

  /** Convierte el texto en una lista de tokens validando cada carácter. */
  function tokenize(input) {
    const src = normalize(String(input));
    if (src.length === 0) throw new CalcError('Escribe una operación.');
    if (src.length > LIMITS.MAX_EXPRESSION_LENGTH) {
      throw new CalcError('La expresión es demasiado larga.');
    }

    const tokens = [];
    let i = 0;

    while (i < src.length) {
      const ch = src[i];
      const rest = src.slice(i);

      // Números: 12, 3.5, .5, 5., 1.5E3, 2E-4
      if (/[0-9.]/.test(ch)) {
        const m = /^(?:\d+\.?\d*|\.\d+)/.exec(rest);
        if (!m) throw new CalcError('Número mal formado.');
        let text = m[0];
        let j = i + text.length;
        if (src[j] === '.') throw new CalcError('Número mal formado: tiene dos puntos decimales.');
        if (src[j] === 'E') {
          const em = /^E[+-]?\d+/.exec(src.slice(j));
          if (!em) throw new CalcError('Notación científica incompleta: falta el exponente.');
          text += em[0];
          j += em[0].length;
          if (src[j] === '.') throw new CalcError('Número mal formado: el exponente debe ser entero.');
        }
        const value = Number(text);
        if (!Number.isFinite(value)) throw new CalcError('El número es demasiado grande.');
        tokens.push({ type: 'num', value, text });
        i = j;
        continue;
      }

      if (rest.startsWith('ʸ√')) {
        tokens.push({ type: 'root', text: 'ʸ√' });
        i += 2;
        continue;
      }
      if (ch === '√') {
        tokens.push({ type: 'sqrt', text: '√' });
        i += 1;
        continue;
      }
      if (ch === 'π') {
        tokens.push({ type: 'const', value: Math.PI, text: 'π' });
        i += 1;
        continue;
      }
      if ('+-*/^!%()'.includes(ch)) {
        tokens.push({ type: ch, text: ch });
        i += 1;
        continue;
      }

      if (/[a-z]/.test(ch)) {
        const name = NAMED_TOKENS.find((n) => rest.startsWith(n));
        if (!name) throw new CalcError(`Función o símbolo desconocido: «${ch}».`);
        if (name === 'pi') {
          tokens.push({ type: 'const', value: Math.PI, text: 'π' });
        } else if (name === 'e') {
          tokens.push({ type: 'const', value: Math.E, text: 'e' });
        } else {
          tokens.push({ type: 'func', name, text: name });
        }
        i += name.length;
        continue;
      }

      if (ch === 'E') throw new CalcError('La notación científica (E) debe ir después de un número.');
      throw new CalcError(`Carácter no válido: «${ch}».`);
    }
    return tokens;
  }

  /**
   * Redondea a `digits` cifras significativas (15 por defecto) y rechaza
   * NaN/Infinity con un mensaje claro.
   */
  function fix(v, digits = LIMITS.SIGNIFICANT_DIGITS) {
    if (Number.isNaN(v)) throw new CalcError('El resultado no es un número real.');
    if (!Number.isFinite(v)) {
      throw new CalcError('El resultado es demasiado grande para mostrarse (desbordamiento).');
    }
    const rounded = Number(v.toPrecision(digits));
    return Number.isFinite(rounded) ? rounded : v;
  }

  const mod = (a, n) => ((a % n) + n) % n;

  /** Elimina residuos de redondeo (sin(π) = 1.2e-16) solo cuando son claramente ruido. */
  function snapTiny(value, angle) {
    return Math.abs(value) < 1e-15 && Math.abs(angle) > 1e-3 ? 0 : value;
  }

  function sine(x, mode) {
    if (mode === 'DEG') {
      const r = mod(x, 360);
      if (r % 180 === 0) return 0;
      if (r === 90) return 1;
      if (r === 270) return -1;
      return Math.sin(r * DEG_TO_RAD);
    }
    return snapTiny(Math.sin(x), x);
  }

  function cosine(x, mode) {
    if (mode === 'DEG') {
      const r = mod(x, 360);
      if (r === 0) return 1;
      if (r === 180) return -1;
      if (r === 90 || r === 270) return 0;
      return Math.cos(r * DEG_TO_RAD);
    }
    return snapTiny(Math.cos(x), x);
  }

  function tangent(x, mode) {
    if (mode === 'DEG') {
      const r = mod(x, 180);
      if (r === 0) return 0;
      if (r === 90) throw new CalcError('tan no está definida en 90° + k·180°.');
      return Math.tan(r * DEG_TO_RAD);
    }
    if (Math.abs(Math.cos(x)) < 1e-15) {
      throw new CalcError('tan no está definida en π/2 + k·π.');
    }
    return snapTiny(Math.tan(x), x);
  }

  function fromRadians(r, mode) {
    return mode === 'DEG' ? (r * 180) / Math.PI : r;
  }

  function applyFunction(name, x, mode) {
    switch (name) {
      case 'sin': return fix(sine(x, mode));
      case 'cos': return fix(cosine(x, mode));
      case 'tan': return fix(tangent(x, mode));
      case 'asin':
        if (x < -1 || x > 1) throw new CalcError('asin: el argumento debe estar entre −1 y 1.');
        return fix(fromRadians(Math.asin(x), mode));
      case 'acos':
        if (x < -1 || x > 1) throw new CalcError('acos: el argumento debe estar entre −1 y 1.');
        return fix(fromRadians(Math.acos(x), mode));
      case 'atan': return fix(fromRadians(Math.atan(x), mode));
      case 'log':
        if (x <= 0) throw new CalcError('log solo está definido para números mayores que 0.');
        return fix(Math.log10(x));
      case 'ln':
        if (x <= 0) throw new CalcError('ln solo está definido para números mayores que 0.');
        return fix(Math.log(x));
      case 'abs': return fix(Math.abs(x));
      case 'sqrt': return squareRoot(x);
      default: throw new CalcError(`Función desconocida: ${name}.`);
    }
  }

  function squareRoot(x) {
    if (x < 0) throw new CalcError('La raíz cuadrada de un número negativo no es real.');
    return fix(Math.sqrt(x));
  }

  function power(base, exponent) {
    if (base === 0 && exponent < 0) {
      throw new CalcError('No se puede dividir entre cero (0 elevado a un exponente negativo).');
    }
    if (base === 0 && exponent === 0) throw new CalcError('0⁰ es una forma indeterminada.');
    if (base < 0 && !Number.isInteger(exponent)) {
      throw new CalcError('Un número negativo con exponente no entero no tiene resultado real.');
    }
    return fix(Math.pow(base, exponent));
  }

  /** Raíz de índice n de x (índice a la izquierda de ʸ√). */
  function nthRoot(n, x) {
    if (n === 0) throw new CalcError('El índice de la raíz no puede ser 0.');
    if (x === 0) {
      if (n < 0) throw new CalcError('No se puede dividir entre cero.');
      return 0;
    }
    if (x < 0) {
      if (Number.isInteger(n) && Math.abs(n) % 2 === 1) return fix(-Math.pow(-x, 1 / n));
      throw new CalcError('No existe la raíz real de un número negativo con ese índice.');
    }
    if (n === 2) return fix(Math.sqrt(x));
    return fix(Math.pow(x, 1 / n));
  }

  function factorial(x) {
    if (!Number.isInteger(x) || x < 0) {
      throw new CalcError('El factorial solo está definido para enteros no negativos (0, 1, 2…).');
    }
    if (x > LIMITS.MAX_FACTORIAL) {
      throw new CalcError('El factorial admite hasta 170! (un valor mayor desborda).');
    }
    let result = 1;
    for (let i = 2; i <= x; i += 1) result *= i;
    return fix(result);
  }

  /**
   * Evalúa una expresión de texto sin eval().
   *
   * Gramática (de menor a mayor precedencia):
   *   expresión := término (('+' | '-') término)*
   *   término   := unario (('*' | '/' | <multiplicación implícita>) unario)*
   *   unario    := ('-' | '+') unario | potencia
   *   potencia  := postfijo (('^' | 'ʸ√') exponente)?      (asociativa a la derecha)
   *   exponente := ('-' | '+') exponente | potencia
   *   postfijo  := primario ('!' | '%')*
   *   primario  := número | π | e | '(' expresión ')' | func '(' expresión ')' | '√' postfijo
   */
  function evaluate(expression, options = {}) {
    const mode = options.angleMode === 'RAD' ? 'RAD' : 'DEG';
    const tokens = tokenize(expression);

    if (options.autoClose !== false) {
      let balance = tokens.filter((t) => t.type === '(').length - tokens.filter((t) => t.type === ')').length;
      while (balance > 0) {
        tokens.push({ type: ')', text: ')' });
        balance -= 1;
      }
    }

    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    const startsOperand = (t) => ['num', 'const', '(', 'func', 'sqrt'].includes(t.type);

    function expectClose() {
      const t = next();
      if (!t || t.type !== ')') throw new CalcError('Falta cerrar un paréntesis.');
    }

    function parseExpression() {
      let value = parseTerm();
      for (let t = peek(); t && (t.type === '+' || t.type === '-'); t = peek()) {
        next();
        const right = parseTerm();
        value = fix(t.type === '+' ? value + right : value - right, LIMITS.INTERMEDIATE_DIGITS);
      }
      return value;
    }

    function parseTerm() {
      let value = parseUnary();
      for (;;) {
        const t = peek();
        if (!t) break;
        if (t.type === '*') {
          next();
          value = fix(value * parseUnary(), LIMITS.INTERMEDIATE_DIGITS);
        } else if (t.type === '/') {
          next();
          const divisor = parseUnary();
          if (divisor === 0) throw new CalcError('No se puede dividir entre cero.');
          value = fix(value / divisor, LIMITS.INTERMEDIATE_DIGITS);
        } else if (startsOperand(t)) {
          value = fix(value * parseUnary(), LIMITS.INTERMEDIATE_DIGITS); // multiplicación implícita: 2π, 3(4+1)
        } else {
          break;
        }
      }
      return value;
    }

    function parseUnary() {
      const t = peek();
      if (t && t.type === '-') {
        next();
        return -parseUnary();
      }
      if (t && t.type === '+') {
        next();
        return parseUnary();
      }
      return parsePower();
    }

    function parsePower() {
      const base = parsePostfix();
      const t = peek();
      if (t && t.type === '^') {
        next();
        return power(base, parseExponent());
      }
      if (t && t.type === 'root') {
        next();
        return nthRoot(base, parseExponent());
      }
      return base;
    }

    function parseExponent() {
      const t = peek();
      if (t && t.type === '-') {
        next();
        return -parseExponent();
      }
      if (t && t.type === '+') {
        next();
        return parseExponent();
      }
      return parsePower();
    }

    function parsePostfix() {
      let value = parsePrimary();
      for (;;) {
        const t = peek();
        if (t && t.type === '!') {
          next();
          value = factorial(value);
        } else if (t && t.type === '%') {
          next();
          value = fix(value / 100, LIMITS.INTERMEDIATE_DIGITS);
        } else {
          break;
        }
      }
      return value;
    }

    function parsePrimary() {
      const t = next();
      if (!t) throw new CalcError('La expresión está incompleta.');
      switch (t.type) {
        case 'num':
        case 'const':
          return t.value;
        case '(': {
          const value = parseExpression();
          expectClose();
          return value;
        }
        case 'func': {
          const open = peek();
          if (!open || open.type !== '(') throw new CalcError(`Falta «(» después de ${t.name}.`);
          next();
          const arg = parseExpression();
          expectClose();
          return applyFunction(t.name, arg, mode);
        }
        case 'sqrt':
          return squareRoot(parsePostfix());
        default:
          throw new CalcError(`Se esperaba un número, pero se encontró «${t.text}».`);
      }
    }

    const value = parseExpression();
    if (pos < tokens.length) {
      const t = tokens[pos];
      if (t.type === ')') throw new CalcError('Hay un paréntesis de cierre sin su paréntesis de apertura.');
      throw new CalcError(`Expresión no válida cerca de «${t.text}».`);
    }
    return fix(value);
  }

  /** Formatea un número para pantalla (15 cifras, notación científica en los extremos). */
  function formatNumber(value) {
    if (value === 0 || Object.is(value, -0)) return '0';
    const abs = Math.abs(value);
    if (abs >= 1e15 || abs < 1e-6) {
      const [mantissa, exponent] = value.toExponential(14).split('e');
      const clean = mantissa.includes('.') ? mantissa.replace(/\.?0+$/, '') : mantissa;
      return `${clean}E${parseInt(exponent, 10)}`;
    }
    return String(Number(value.toPrecision(LIMITS.SIGNIFICANT_DIGITS)));
  }

  /** Añade los paréntesis de cierre que falten. */
  function closeParens(expr) {
    const opens = (expr.match(/\(/g) || []).length;
    const closes = (expr.match(/\)/g) || []).length;
    return opens > closes ? expr + ')'.repeat(opens - closes) : expr;
  }

  const errorMessage = (err) => (err instanceof CalcError ? err.message : 'No se pudo calcular la expresión.');

  /* ======================================================================
     2. ESTADO DE LA CALCULADORA (sin DOM)
     ====================================================================== */

  const VALUE_END = /[0-9)πe!%]$/;          // la expresión termina en un valor
  const OPERATOR_END = /(?:[+−×÷^]|ʸ√)$/;  // termina en un operador

  /** Posición donde empieza el último operando de la expresión, o -1. */
  function findOperandStart(expr) {
    let end = expr.length;
    while (end > 0 && (expr[end - 1] === '!' || expr[end - 1] === '%')) end -= 1;
    if (end === 0) return -1;
    const last = expr[end - 1];

    if (/[0-9.]/.test(last)) {
      const m = /(?:\d+\.?\d*|\.\d+)(?:E[+−-]?\d+)?$/.exec(expr.slice(0, end));
      return m ? m.index : -1;
    }
    if (last === 'π' || last === 'e') return end - 1;
    if (last === ')') {
      let depth = 0;
      let i = end - 1;
      for (; i >= 0; i -= 1) {
        if (expr[i] === ')') depth += 1;
        else if (expr[i] === '(') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (i < 0) return -1;
      const before = expr.slice(0, i);
      const fn = /(asin|acos|atan|sqrt|sin|cos|tan|log|ln|abs)$/.exec(before);
      if (fn) return i - fn[0].length;
      if (before.endsWith('√') && !before.endsWith('ʸ√')) return i - 1;
      return i;
    }
    return -1;
  }

  class Calculator {
    constructor() {
      this.angleMode = 'DEG';
      this.reset();
    }

    reset() {
      this.expr = '';
      this.result = '';
      this.justEvaluated = false;
      this.error = '';
    }

    /** Punto de entrada único para botones y teclado. */
    press(action, value) {
      switch (action) {
        case 'digit': return this._digit(value);
        case 'decimal': return this._decimal();
        case 'op': return this._operator(value);
        case 'fn': return this._function(value);
        case 'const': return this._constant(value);
        case 'open': return this._open();
        case 'close': return this._close();
        case 'exp': return this._exp();
        case 'post': return this._postfix(value);
        case 'sign': return this._sign();
        case 'equals': return this._equals();
        case 'clear': return this.reset();
        case 'back': return this._backspace();
        case 'mode': return this.setAngleMode(value);
        default: return undefined;
      }
    }

    setAngleMode(value) {
      const mode = value === 'toggle' ? (this.angleMode === 'DEG' ? 'RAD' : 'DEG') : value;
      if (mode !== 'DEG' && mode !== 'RAD') return;
      this.angleMode = mode;
      if (this.justEvaluated) {
        try {
          this.result = formatNumber(evaluate(this.expr, { angleMode: mode }));
        } catch (err) {
          this.error = errorMessage(err);
          this.justEvaluated = false;
        }
      }
    }

    /** Datos listos para pintar. */
    getView() {
      const view = {
        expression: this.expr + (this.justEvaluated ? ' =' : ''),
        main: '',
        isPreview: false,
        error: this.error,
        angleMode: this.angleMode,
      };
      if (this.error) return view;
      if (this.justEvaluated) {
        view.main = this.result.replace(/-/g, '−');
      } else if (!this.expr) {
        view.main = '0';
      } else {
        view.isPreview = true;
        try {
          view.main = formatNumber(evaluate(this.expr, { angleMode: this.angleMode })).replace(/-/g, '−');
        } catch (err) {
          view.main = ''; // expresión incompleta: sin vista previa
        }
      }
      return view;
    }

    /* ---- utilidades internas ---- */

    _begin(mode) {
      this.error = '';
      if (this.justEvaluated) {
        this.expr = mode === 'continue' ? this.result.replace(/-/g, '−') : '';
        this.justEvaluated = false;
      }
    }

    _append(text) {
      if (this.expr.length + text.length > LIMITS.MAX_INPUT_LENGTH) {
        this.error = 'Se alcanzó la longitud máxima de la expresión.';
        return false;
      }
      this.expr += text;
      return true;
    }

    _insertValue(token) {
      if (VALUE_END.test(this.expr) && !this._append('×')) return;
      this._append(token);
    }

    /* ---- acciones ---- */

    _digit(d) {
      this._begin('new');
      if (/(^|[^0-9.])0$/.test(this.expr)) {
        if (d === '0') return;
        this.expr = this.expr.slice(0, -1) + d;
        return;
      }
      if (/[)πe!%]$/.test(this.expr) && !this._append('×')) return;
      this._append(d);
    }

    _decimal() {
      this._begin('new');
      if (/\.\d*$/.test(this.expr) || /E[+−-]?\d*$/.test(this.expr)) return;
      if (!/\d$/.test(this.expr)) {
        if (VALUE_END.test(this.expr) && !this._append('×')) return;
        if (!this._append('0')) return;
      }
      this._append('.');
    }

    _operator(op) {
      this._begin('continue');
      const e = this.expr;
      if (e === '') {
        if (op === '−') this.expr = '−';
        return;
      }
      if (/E$/.test(e)) { // signo del exponente: 2E+5, 2E−5
        if (op === '+' || op === '−') this._append(op);
        return;
      }
      if (/\($/.test(e)) {
        if (op === '−') this._append('−');
        return;
      }
      if (OPERATOR_END.test(e)) {
        if (op === '−') {
          if (/[+−]$/.test(e)) this.expr = e.slice(0, -1) + '−';
          else this._append('−'); // signo negativo tras × ÷ ^ ʸ√
          return;
        }
        const stripped = e.replace(/(?:[+−×÷^]|ʸ√)+$/, '');
        if (stripped === '' || /\($/.test(stripped)) return;
        this.expr = stripped + op;
        return;
      }
      this._append(op);
    }

    _function(name) {
      const token = name === 'sqrt' ? '√(' : `${name}(`;
      if (this.justEvaluated) { // aplica la función al resultado: sin(resultado)
        this.error = '';
        const wrapped = `${token}${this.result.replace(/-/g, '−')})`;
        this.justEvaluated = false;
        this.expr = '';
        this._append(wrapped);
        return;
      }
      this._begin('new');
      this._insertValue(token);
    }

    _constant(c) {
      this._begin('new');
      this._insertValue(c);
    }

    _open() {
      this._begin('new');
      this._insertValue('(');
    }

    _close() {
      this.error = '';
      if (this.justEvaluated) return;
      const opens = (this.expr.match(/\(/g) || []).length;
      const closes = (this.expr.match(/\)/g) || []).length;
      if (opens > closes && VALUE_END.test(this.expr)) this._append(')');
    }

    _exp() {
      this._begin('continue');
      if (/\d$/.test(this.expr) && !/E[+−-]?\d*$/.test(this.expr)) this._append('E');
    }

    _postfix(kind) {
      this._begin('continue');
      const e = this.expr;
      if (kind === '%' || kind === '!') {
        if (VALUE_END.test(e)) this._append(kind);
      } else if (kind === 'sq') {
        if (VALUE_END.test(e)) this._append('^2');
      } else if (kind === 'inv') {
        if (VALUE_END.test(e)) this._append('^(−1)');
        else if (e === '' || /[+−×÷^(]$|ʸ√$/.test(e)) this._append('1÷(');
      }
    }

    _sign() {
      this._begin('continue');
      if (this.expr === '') {
        this.expr = '−';
        return;
      }
      const start = findOperandStart(this.expr);
      if (start < 0) return;
      const before = this.expr.slice(0, start);
      const operand = this.expr.slice(start);
      let next;
      if (before === '') {
        next = `−${operand}`;
      } else {
        const last = before.slice(-1);
        const prev = before.slice(-2, -1);
        const unaryMinus = last === '−' && (before.length === 1 || /[+−×÷^(√]/.test(prev));
        if (unaryMinus) next = before.slice(0, -1) + operand;
        else if (last === '+') next = `${before.slice(0, -1)}−${operand}`;
        else if (last === '−') next = `${before.slice(0, -1)}+${operand}`;
        else if (/[×÷^(√]/.test(last)) next = `${before}−${operand}`;
        else next = `${before}×−${operand}`;
      }
      if (next.length <= LIMITS.MAX_INPUT_LENGTH) this.expr = next;
    }

    _backspace() {
      this.error = '';
      this.justEvaluated = false; // vuelve a editar la expresión original
      this.expr = this.expr.replace(
        /(?:asin\(|acos\(|atan\(|sqrt\(|sin\(|cos\(|tan\(|log\(|ln\(|abs\(|√\(|ʸ√|\^\(−1\)|[\s\S])$/,
        '',
      );
    }

    _equals() {
      if (this.justEvaluated || !this.expr) return;
      this.error = '';
      try {
        const closed = closeParens(this.expr);
        const value = evaluate(closed, { angleMode: this.angleMode });
        this.expr = closed;
        this.result = formatNumber(value);
        this.justEvaluated = true;
      } catch (err) {
        this.error = errorMessage(err);
      }
    }
  }

  /* ======================================================================
     3. TECLADO FÍSICO
     ====================================================================== */

  const KEY_MAP = Object.freeze({
    '+': ['op', '+'], '-': ['op', '−'], '*': ['op', '×'], x: ['op', '×'],
    '/': ['op', '÷'], '^': ['op', '^'], r: ['op', 'ʸ√'],
    '(': ['open'], ')': ['close'], '.': ['decimal'], ',': ['decimal'],
    '%': ['post', '%'], '!': ['post', '!'],
    Enter: ['equals'], '=': ['equals'],
    Escape: ['clear'], Delete: ['clear'], Backspace: ['back'],
    p: ['const', 'π'], e: ['const', 'e'], E: ['exp'],
    s: ['fn', 'sin'], c: ['fn', 'cos'], t: ['fn', 'tan'],
    l: ['fn', 'log'], n: ['fn', 'ln'], q: ['fn', 'sqrt'], a: ['fn', 'abs'],
    d: ['mode', 'toggle'],
  });

  /** Devuelve [acción, valor] para una tecla (event.key) o null. */
  function keyToAction(key) {
    if (/^[0-9]$/.test(key)) return ['digit', key];
    return Object.prototype.hasOwnProperty.call(KEY_MAP, key) ? KEY_MAP[key] : null;
  }

  function createMeowPlayer(win) {
    const AudioContextClass = win.AudioContext || win.webkitAudioContext;
    if (typeof AudioContextClass !== 'function') return () => {};

    let audioContext;
    let audioErrorReported = false;

    function reportAudioError(error) {
      if (audioErrorReported) return;
      audioErrorReported = true;
      console.warn('No se pudo reproducir el maullido de la calculadora.', error);
    }

    return function playMeow() {
      try {
        if (!audioContext) audioContext = new AudioContextClass();
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(reportAudioError);
        }

        const now = audioContext.currentTime;
        const envelope = audioContext.createGain();
        const filter = audioContext.createBiquadFilter();
        const voice = audioContext.createOscillator();
        const harmonic = audioContext.createOscillator();
        const harmonicGain = audioContext.createGain();

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(3200, now);
        envelope.gain.setValueAtTime(0.0001, now);
        envelope.gain.exponentialRampToValueAtTime(0.22, now + 0.04);
        envelope.gain.setValueAtTime(0.14, now + 0.16);
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
        harmonicGain.gain.setValueAtTime(0.18, now);

        voice.type = 'triangle';
        voice.frequency.setValueAtTime(520, now);
        voice.frequency.exponentialRampToValueAtTime(780, now + 0.11);
        voice.frequency.exponentialRampToValueAtTime(390, now + 0.43);
        harmonic.type = 'sine';
        harmonic.frequency.setValueAtTime(1040, now);
        harmonic.frequency.exponentialRampToValueAtTime(1560, now + 0.11);
        harmonic.frequency.exponentialRampToValueAtTime(780, now + 0.43);

        voice.connect(filter);
        harmonic.connect(harmonicGain);
        harmonicGain.connect(filter);
        filter.connect(envelope);
        envelope.connect(audioContext.destination);

        voice.onended = () => {
          voice.disconnect();
          harmonic.disconnect();
          harmonicGain.disconnect();
          filter.disconnect();
          envelope.disconnect();
        };
        voice.start(now);
        harmonic.start(now);
        voice.stop(now + 0.45);
        harmonic.stop(now + 0.45);
      } catch (error) {
        reportAudioError(error);
      }
    };
  }

  /* ======================================================================
     4. INTERFAZ (DOM)
     ====================================================================== */

  function bootUI(doc) {
    const calc = new Calculator();
    const root = doc.documentElement;
    const exprEl = doc.getElementById('expression');
    const resultEl = doc.getElementById('result');
    const buttons = Array.from(doc.querySelectorAll('button[data-action]'));
    const modeButtons = buttons.filter((b) => b.dataset.action === 'mode');
    const themeBtn = doc.getElementById('theme-toggle');
    const win = doc.defaultView;
    const playMeow = createMeowPlayer(win);

    function fitText(el, minPx) {
      el.style.fontSize = '';
      let size = parseFloat(win.getComputedStyle(el).fontSize) || 0;
      let guard = 60;
      while (size > minPx && el.scrollWidth > el.clientWidth && guard > 0) {
        size -= 1;
        guard -= 1;
        el.style.fontSize = `${size}px`;
      }
    }

    function render() {
      const view = calc.getView();
      exprEl.textContent = view.expression;
      exprEl.scrollLeft = exprEl.scrollWidth;

      const showError = Boolean(view.error);
      resultEl.textContent = showError ? view.error : view.main;
      resultEl.classList.toggle('is-error', showError);
      resultEl.classList.toggle('is-preview', view.isPreview && !showError);
      if (showError) resultEl.style.fontSize = '';
      else fitText(resultEl, 20);

      modeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === view.angleMode)));
    }

    function flash(action, value) {
      const btn = buttons.find((b) => b.dataset.action === action && (value === undefined || b.dataset.value === value));
      if (!btn) return;
      btn.classList.add('is-pressed');
      win.setTimeout(() => btn.classList.remove('is-pressed'), 120);
    }

    // Clic / toque en cualquier botón (delegación de eventos).
    doc.querySelector('.calc').addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-action]');
      if (!btn) return;
      calc.press(btn.dataset.action, btn.dataset.value);
      render();
      playMeow();
      if (event.detail !== 0) btn.blur(); // el foco no debe "secuestrar" la tecla Enter
    });

    // Teclado físico.
    doc.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target && target.tagName === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) return;
      const mapped = keyToAction(event.key);
      if (!mapped) return;
      event.preventDefault();
      calc.press(mapped[0], mapped[1]);
      flash(mapped[0], mapped[1]);
      render();
      playMeow();
    });

    // Tema (oscuro por defecto).
    function applyTheme(theme) {
      root.dataset.theme = theme;
      const meta = doc.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'dark' ? '#161b22' : '#f5f7fa');
      themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      themeBtn.textContent = theme === 'dark' ? '☀' : '☾';
    }
    let saved = null;
    try { saved = win.localStorage.getItem('sci-calc-theme'); } catch (e) { /* almacenamiento no disponible */ }
    applyTheme(saved === 'light' ? 'light' : 'dark');
    themeBtn.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { win.localStorage.setItem('sci-calc-theme', next); } catch (e) { /* ignorar */ }
      themeBtn.blur();
    });

    // PWA: funcionamiento sin conexión (solo bajo http/https; no en file://).
    if ('serviceWorker' in win.navigator && /^https?:$/.test(win.location.protocol)) {
      win.addEventListener('load', () => {
        win.navigator.serviceWorker.register('sw.js').catch(() => { /* la app sigue funcionando */ });
      });
    }

    render();
    return calc;
  }

  /* ---- Exportaciones y arranque ---- */

  const api = { evaluate, tokenize, formatNumber, closeParens, CalcError, Calculator, keyToAction, createMeowPlayer, bootUI, LIMITS };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') {
    const start = () => bootUI(document);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})();
