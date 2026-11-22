export interface SourceLocation {
  fileName: string;
  offset: number;
  line: number;
  column: number;
}
export type TokenKind = "identifier" | "string" | "number" | "symbol" | "eof";
export interface Token { kind: TokenKind; value: string; location: SourceLocation; }

export class JavafySyntaxError extends SyntaxError {
  readonly fileName: string;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
  constructor(message: string, location: SourceLocation) {
    super(location.fileName + ":" + location.line + ":" + location.column + ": " + message);
    this.name = "JavafySyntaxError";
    this.fileName = location.fileName;
    this.line = location.line;
    this.column = location.column;
    this.offset = location.offset;
  }
}

export interface JavafyProgram { kind: "Program"; page: JavafyPage; location: SourceLocation; }
export interface JavafyPage { kind: "Page"; name: string; title?: string; children: JavafyNode[]; location: SourceLocation; }
export interface JavafyElement { kind: "Element"; tag: string; children: JavafyNode[]; location: SourceLocation; }
export interface JavafyText { kind: "Text"; tag: "text" | "h1" | "h2" | "p"; value: string; location: SourceLocation; }
export interface JavafyButton { kind: "Button"; label: string; actions: JavafyAction[]; location: SourceLocation; }
export interface JavafyAction { kind: "Navigate"; target: string; location: SourceLocation; }
export type JavafyNode = JavafyElement | JavafyText | JavafyButton;

class Lexer {
  private offset = 0;
  private line = 1;
  private column = 1;
  constructor(private readonly source: string, private readonly fileName: string) {}

  scan(): Token[] {
    const tokens: Token[] = [];
    while (!this.isAtEnd()) {
      const char = this.peek();
      if (/\s/.test(char)) { this.advance(); continue; }
      if (char === "/" && this.peekNext() === "/") {
        while (!this.isAtEnd() && this.peek() !== "\n") this.advance();
        continue;
      }
      const location = this.location();
      if (/[A-Za-z_]/.test(char)) {
        let value = "";
        while (/[A-Za-z0-9_-]/.test(this.peek())) value += this.advance();
        tokens.push({ kind: "identifier", value, location });
        continue;
      }
      if (/[0-9]/.test(char)) {
        let value = "";
        while (/[0-9]/.test(this.peek())) value += this.advance();
        tokens.push({ kind: "number", value, location });
        continue;
      }
      if (char === '"') { tokens.push(this.readString(location)); continue; }
      if ("{}():,".includes(char)) {
        tokens.push({ kind: "symbol", value: this.advance(), location });
        continue;
      }
      throw new JavafySyntaxError("Unexpected character " + JSON.stringify(char) + ".", location);
    }
    tokens.push({ kind: "eof", value: "", location: this.location() });
    return tokens;
  }

  private readString(location: SourceLocation): Token {
    this.advance();
    let value = "";
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === "\n") throw new JavafySyntaxError("String literals cannot contain an unescaped newline.", this.location());
      if (this.peek() === "\\") {
        this.advance();
        if (this.isAtEnd()) break;
        const escaped = this.advance();
        const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" };
        if (!(escaped in escapes)) throw new JavafySyntaxError("Unsupported escape sequence: " + escaped + ".", this.location());
        value += escapes[escaped];
      } else value += this.advance();
    }
    if (this.isAtEnd()) throw new JavafySyntaxError("Unterminated string literal.", location);
    this.advance();
    return { kind: "string", value, location };
  }

  private location(): SourceLocation { return { fileName: this.fileName, offset: this.offset, line: this.line, column: this.column }; }
  private peek(): string { return this.source[this.offset] ?? "\0"; }
  private peekNext(): string { return this.source[this.offset + 1] ?? "\0"; }
  private isAtEnd(): boolean { return this.offset >= this.source.length; }
  private advance(): string {
    const char = this.source[this.offset++] ?? "\0";
    if (char === "\n") { this.line++; this.column = 1; } else this.column++;
    return char;
  }
}

class Parser {
  private current = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): JavafyProgram {
    const start = this.peek().location;
    this.consumeKeyword("page", "Expected a page declaration beginning with 'page'.");
    const name = this.consumeIdentifier("Expected a page name.");
    this.consumeSymbol("{", "Expected '{' after the page name.");
    let title: string | undefined;
    let children: JavafyNode[] | undefined;
    while (!this.checkSymbol("}") && !this.isAtEnd()) {
      if (this.matchKeyword("title")) {
        if (title !== undefined) this.fail("A page can only declare one title.");
        this.consumeSymbol(":", "Expected ':' after title.");
        title = this.consumeString("Expected a quoted page title.").value;
      } else if (this.matchKeyword("render")) {
        if (children !== undefined) this.fail("A page can only declare one render block.");
        this.consumeSymbol("{", "Expected '{' after render.");
        children = this.parseNodes();
        this.consumeSymbol("}", "Expected '}' after the render block.");
      } else this.fail("Expected 'title' or 'render' inside the page declaration.");
    }
    this.consumeSymbol("}", "Expected '}' after the page declaration.");
    if (children === undefined) this.fail("A page must contain a render block.");
    if (!this.isAtEnd()) this.fail("Unexpected content after the page declaration.");
    return { kind: "Program", location: start, page: {
      kind: "Page", name: name.value, ...(title === undefined ? {} : { title }), children, location: name.location
    }};
  }

  private parseNodes(): JavafyNode[] {
    const nodes: JavafyNode[] = [];
    while (!this.checkSymbol("}") && !this.isAtEnd()) {
      const token = this.consumeIdentifier("Expected an element, text node, heading, or button.");
      if (token.value === "element") {
        const tag = this.consumeIdentifier("Expected an element tag name.");
        this.consumeSymbol("{", "Expected '{' after the element tag.");
        const children = this.parseNodes();
        this.consumeSymbol("}", "Expected '}' after element children.");
        nodes.push({ kind: "Element", tag: tag.value, children, location: token.location });
      } else if (token.value === "text" || token.value === "h1" || token.value === "h2" || token.value === "p") {
        const value = this.consumeString("Expected a quoted string after '" + token.value + "'.");
        nodes.push({ kind: "Text", tag: token.value, value: value.value, location: token.location });
      } else if (token.value === "button") {
        const label = this.consumeString("Expected a quoted button label.");
        const actions: JavafyAction[] = [];
        if (this.matchSymbol("{")) {
          this.consumeKeyword("on", "Expected 'on' inside a button block.");
          this.consumeKeyword("click", "Only the 'click' button event is supported currently.");
          this.consumeSymbol("{", "Expected '{' after 'on click'.");
          this.consumeKeyword("navigate", "Expected navigate() inside the click handler.");
          this.consumeSymbol("(", "Expected '(' after navigate.");
          const target = this.consumeString("Expected a quoted navigation target.");
          this.consumeSymbol(")", "Expected ')' after the navigation target.");
          this.consumeSymbol("}", "Expected '}' after the click handler.");
          this.consumeSymbol("}", "Expected '}' after the button block.");
          actions.push({ kind: "Navigate", target: target.value, location: token.location });
        }
        nodes.push({ kind: "Button", label: label.value, actions, location: token.location });
      } else throw new JavafySyntaxError("Unknown render node '" + token.value + "'.", token.location);
    }
    return nodes;
  }

  private consumeKeyword(value: string, message: string): Token {
    if (this.matchKeyword(value)) return this.previous();
    this.fail(message);
  }
  private consumeIdentifier(message: string): Token {
    if (this.peek().kind === "identifier") return this.advance();
    this.fail(message);
  }
  private consumeString(message: string): Token {
    if (this.peek().kind === "string") return this.advance();
    this.fail(message);
  }
  private consumeSymbol(value: string, message: string): Token {
    if (this.matchSymbol(value)) return this.previous();
    this.fail(message);
  }
  private matchKeyword(value: string): boolean {
    if (this.peek().kind !== "identifier" || this.peek().value !== value) return false;
    this.advance(); return true;
  }
  private matchSymbol(value: string): boolean {
    if (!this.checkSymbol(value)) return false;
    this.advance(); return true;
  }
  private checkSymbol(value: string): boolean { return this.peek().kind === "symbol" && this.peek().value === value; }
  private peek(): Token { return this.tokens[this.current] ?? this.tokens[this.tokens.length - 1]!; }
  private previous(): Token { return this.tokens[this.current - 1]!; }
  private isAtEnd(): boolean { return this.peek().kind === "eof"; }
  private advance(): Token { if (!this.isAtEnd()) this.current++; return this.previous(); }
  private fail(message: string): never { throw new JavafySyntaxError(message, this.peek().location); }
}

export function tokenize(source: string, fileName = "<anonymous>.jfy"): Token[] {
  return new Lexer(source, fileName).scan();
}
export function parse(source: string, fileName = "<anonymous>.jfy"): JavafyProgram {
  return new Parser(tokenize(source, fileName)).parse();
}
