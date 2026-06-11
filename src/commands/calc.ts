/**
 * Safe arithmetic evaluator for simple math expressions.
 * Supports +, -, *, /, parentheses, and decimal numbers.
 */
import type { Command } from "../types";

const ALLOWED_CHARS = /^[\d+\-*/().\s]+$/;

/** Token types produced by the lexer. */
type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ kind: "lparen" });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: "rparen" });
      index += 1;
      continue;
    }

    if ("+-*/".includes(char)) {
      tokens.push({ kind: "op", value: char as "+" | "-" | "*" | "/" });
      index += 1;
      continue;
    }

    if (/[\d.]/.test(char)) {
      let numberText = char;
      index += 1;
      while (index < expression.length && /[\d.]/.test(expression[index])) {
        numberText += expression[index];
        index += 1;
      }
      const value = Number(numberText);
      if (Number.isNaN(value)) {
        throw new Error("Invalid number in expression");
      }
      tokens.push({ kind: "number", value });
      continue;
    }

    throw new Error("Invalid character in expression");
  }

  return tokens;
}

class Parser {
  private tokens: Token[];
  private position = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): number {
    const result = this.parseExpression();
    if (this.peek()) {
      throw new Error("Unexpected tokens after expression");
    }
    return result;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private consume(): Token {
    const token = this.tokens[this.position];
    if (!token) {
      throw new Error("Unexpected end of expression");
    }
    this.position += 1;
    return token;
  }

  private parseExpression(): number {
    let value = this.parseTerm();

    while (this.peek()?.kind === "op" && (this.peek() as Token & { kind: "op" }).value.match(/[+-]/)) {
      const op = (this.consume() as Token & { kind: "op" }).value;
      const right = this.parseTerm();
      value = op === "+" ? value + right : value - right;
    }

    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();

    while (this.peek()?.kind === "op" && (this.peek() as Token & { kind: "op" }).value.match(/[*/]/)) {
      const op = (this.consume() as Token & { kind: "op" }).value;
      const right = this.parseFactor();
      if (op === "/" && right === 0) {
        throw new Error("Division by zero");
      }
      value = op === "*" ? value * right : value / right;
    }

    return value;
  }

  private parseFactor(): number {
    const token = this.peek();

    if (token?.kind === "op" && token.value === "-") {
      this.consume();
      return -this.parseFactor();
    }

    if (token?.kind === "op" && token.value === "+") {
      this.consume();
      return this.parseFactor();
    }

    if (token?.kind === "number") {
      this.consume();
      return token.value;
    }

    if (token?.kind === "lparen") {
      this.consume();
      const value = this.parseExpression();
      if (this.peek()?.kind !== "rparen") {
        throw new Error("Missing closing parenthesis");
      }
      this.consume();
      return value;
    }

    throw new Error("Invalid expression");
  }
}

function evaluateExpression(expression: string): number {
  const trimmed = expression.trim();
  if (!trimmed) {
    throw new Error("Usage: calc <expression>");
  }
  if (!ALLOWED_CHARS.test(trimmed)) {
    throw new Error("Expression contains invalid characters");
  }

  const tokens = tokenize(trimmed);
  return new Parser(tokens).parse();
}

export const calcCommand: Command = {
  name: "calc",
  category: "System",
  description: "Evaluate a math expression (e.g. calc 5*8)",
  examples: ["calc 5*8", "calc (10 + 3) / 2", "calc 100 - 25 * 2"],
  execute(args: string): string {
    try {
      const result = evaluateExpression(args);
      return String(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid expression";
      return message;
    }
  },
};
