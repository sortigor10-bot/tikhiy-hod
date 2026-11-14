const boardElement = document.getElementById('chessBoard');
const statusElement = document.getElementById('gameStatus');
const statusDot = document.getElementById('statusDot');
const positionLabel = document.getElementById('positionLabel');
const moveListElement = document.getElementById('moveList');
const moveCountElement = document.getElementById('moveCount');
const undoButton = document.getElementById('undoButton');
const difficultySelect = document.getElementById('difficulty');
const playerColorSelect = document.getElementById('playerColor');
const botDifficultyLabel = document.getElementById('botDifficultyLabel');
const thinkingLabel = document.getElementById('thinkingLabel');
const promotionDialog = document.getElementById('promotionDialog');
const promotionOptions = document.getElementById('promotionOptions');
const resultDialog = document.getElementById('resultDialog');
const resultCard = document.getElementById('resultCard');
const resultTitle = document.getElementById('resultTitle');
const resultMessage = document.getElementById('resultMessage');
const resultIcon = document.getElementById('resultIcon');
const resultViewBoardButton = document.getElementById('resultViewBoardButton');

const files = 'abcdefgh';
const symbols = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};
const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const directions = {
  bishop: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  rook: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  knight: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
  king: [[1, 1], [1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, 0], [-1, -1]],
};
const difficultyNames = {
  1: 'Для разминки',
  2: 'Уверенный игрок',
  3: 'Серьёзный соперник',
};

let position = createInitialPosition();
let selectedSquare = null;
let selectedMoves = [];
let lastMove = null;
let gameOver = false;
let botThinking = false;
let activeMoveAnimation = null;
let botMoveTimeout = null;
let resultTimeout = null;
let playerColor = 'w';
let boardFlipped = false;
let gameStarted = false;
let playedMoves = [];
let positionHistory = [positionKey(position)];
let undoStack = [];

function createInitialPosition() {
  const board = Array(64).fill(null);
  const backRank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  for (let file = 0; file < 8; file += 1) {
    board[file] = backRank[file];
    board[8 + file] = 'P';
    board[48 + file] = 'p';
    board[56 + file] = backRank[file].toLowerCase();
  }
  return {
    board,
    turn: 'w',
    castling: { K: true, Q: true, k: true, q: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

function clonePosition(source) {
  return {
    board: source.board.slice(),
    turn: source.turn,
    castling: { ...source.castling },
    enPassant: source.enPassant,
    halfmove: source.halfmove,
    fullmove: source.fullmove,
  };
}

function colorOf(piece) {
  if (!piece) return null;
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function indexOf(file, rank) {
  return rank * 8 + file;
}

function squareName(square) {
  return `${files[square % 8]}${Math.floor(square / 8) + 1}`;
}

function positionKey(current) {
  return `${current.board.map((piece) => piece || '-').join('')}${current.turn}${Object.entries(current.castling).filter(([, canCastle]) => canCastle).map(([side]) => side).join('') || '-'}${current.enPassant === null ? '-' : squareName(current.enPassant)}`;
}

function isAttacked(current, target, byColor) {
  const targetFile = target % 8;
  const targetRank = Math.floor(target / 8);
  const pawnRank = targetRank + (byColor === 'w' ? -1 : 1);
  for (const pawnFile of [targetFile - 1, targetFile + 1]) {
    if (pawnFile >= 0 && pawnFile < 8 && pawnRank >= 0 && pawnRank < 8) {
      const piece = current.board[indexOf(pawnFile, pawnRank)];
      if (piece && colorOf(piece) === byColor && piece.toLowerCase() === 'p') return true;
    }
  }

  for (const [fileStep, rankStep] of directions.knight) {
    const file = targetFile + fileStep;
    const rank = targetRank + rankStep;
    if (file < 0 || file > 7 || rank < 0 || rank > 7) continue;
    const piece = current.board[indexOf(file, rank)];
    if (piece && colorOf(piece) === byColor && piece.toLowerCase() === 'n') return true;
  }

  for (const [fileStep, rankStep] of directions.king) {
    const file = targetFile + fileStep;
    const rank = targetRank + rankStep;
    if (file < 0 || file > 7 || rank < 0 || rank > 7) continue;
    const piece = current.board[indexOf(file, rank)];
    if (piece && colorOf(piece) === byColor && piece.toLowerCase() === 'k') return true;
  }

  for (const [rays, attackers] of [
    [directions.bishop, ['b', 'q']],
    [directions.rook, ['r', 'q']],
  ]) {
    for (const [fileStep, rankStep] of rays) {
      let file = targetFile + fileStep;
      let rank = targetRank + rankStep;
      while (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
        const piece = current.board[indexOf(file, rank)];
        if (piece) {
          if (colorOf(piece) === byColor && attackers.includes(piece.toLowerCase())) return true;
          break;
        }
        file += fileStep;
        rank += rankStep;
      }
    }
  }
  return false;
}

function kingSquare(current, color) {
  return current.board.findIndex((piece) => piece && piece.toLowerCase() === 'k' && colorOf(piece) === color);
}

function isInCheck(current, color = current.turn) {
  const king = kingSquare(current, color);
  return king !== -1 && isAttacked(current, king, color === 'w' ? 'b' : 'w');
}

function addPawnMove(moves, from, to, color, extra = {}) {
  const targetRank = Math.floor(to / 8);
  if (targetRank === (color === 'w' ? 7 : 0)) {
    for (const promotion of ['q', 'r', 'b', 'n']) moves.push({ from, to, promotion, ...extra });
  } else {
    moves.push({ from, to, ...extra });
  }
}

function pseudoMoves(current, color = current.turn) {
  const moves = [];
  for (let from = 0; from < 64; from += 1) {
    const piece = current.board[from];
    if (!piece || colorOf(piece) !== color) continue;
    const type = piece.toLowerCase();
    const file = from % 8;
    const rank = Math.floor(from / 8);

    if (type === 'p') {
      const step = color === 'w' ? 1 : -1;
      const nextRank = rank + step;
      if (nextRank >= 0 && nextRank < 8) {
        const forward = indexOf(file, nextRank);
        if (!current.board[forward]) {
          addPawnMove(moves, from, forward, color);
          const startingRank = color === 'w' ? 1 : 6;
          const doubleForward = indexOf(file, rank + step * 2);
          if (rank === startingRank && !current.board[doubleForward]) {
            moves.push({ from, to: doubleForward, doublePawn: true });
          }
        }
        for (const captureFile of [file - 1, file + 1]) {
          if (captureFile < 0 || captureFile > 7) continue;
          const to = indexOf(captureFile, nextRank);
          const target = current.board[to];
          if (target && colorOf(target) !== color && target.toLowerCase() !== 'k') {
            addPawnMove(moves, from, to, color, { capture: target });
          } else if (current.enPassant === to) {
            moves.push({ from, to, capture: color === 'w' ? 'p' : 'P', enPassant: true });
          }
        }
      }
      continue;
    }

    const steps = type === 'n' ? directions.knight
      : type === 'k' ? directions.king
        : type === 'b' ? directions.bishop
          : type === 'r' ? directions.rook
            : [...directions.bishop, ...directions.rook];
    for (const [fileStep, rankStep] of steps) {
      let targetFile = file + fileStep;
      let targetRank = rank + rankStep;
      while (targetFile >= 0 && targetFile < 8 && targetRank >= 0 && targetRank < 8) {
        const to = indexOf(targetFile, targetRank);
        const target = current.board[to];
        if (!target) {
          moves.push({ from, to });
        } else {
          if (colorOf(target) !== color && target.toLowerCase() !== 'k') {
            moves.push({ from, to, capture: target });
          }
          break;
        }
        if (type === 'n' || type === 'k') break;
        targetFile += fileStep;
        targetRank += rankStep;
      }
    }

    if (type === 'k' && !isInCheck(current, color)) {
      const homeRank = color === 'w' ? 0 : 7;
      const kingSide = color === 'w' ? 'K' : 'k';
      const queenSide = color === 'w' ? 'Q' : 'q';
      const enemy = color === 'w' ? 'b' : 'w';
      if (from === indexOf(4, homeRank) && current.castling[kingSide]) {
        if (!current.board[indexOf(5, homeRank)] && !current.board[indexOf(6, homeRank)]
          && !isAttacked(current, indexOf(5, homeRank), enemy)
          && !isAttacked(current, indexOf(6, homeRank), enemy)) {
          moves.push({ from, to: indexOf(6, homeRank), castle: 'king' });
        }
      }
      if (from === indexOf(4, homeRank) && current.castling[queenSide]) {
        if (!current.board[indexOf(1, homeRank)] && !current.board[indexOf(2, homeRank)] && !current.board[indexOf(3, homeRank)]
          && !isAttacked(current, indexOf(3, homeRank), enemy)
          && !isAttacked(current, indexOf(2, homeRank), enemy)) {
          moves.push({ from, to: indexOf(2, homeRank), castle: 'queen' });
        }
      }
    }
  }
  return moves;
}

function applyMove(current, move) {
  const next = clonePosition(current);
  const piece = next.board[move.from];
  const color = colorOf(piece);
  const capturedSquare = move.enPassant ? move.to + (color === 'w' ? -8 : 8) : move.to;
  const capturedPiece = next.board[capturedSquare];
  next.board[move.from] = null;
  next.board[move.to] = move.promotion
    ? (color === 'w' ? move.promotion.toUpperCase() : move.promotion)
    : piece;

  if (move.enPassant) next.board[capturedSquare] = null;
  if (move.castle) {
    const rank = color === 'w' ? 0 : 7;
    const rookFrom = indexOf(move.castle === 'king' ? 7 : 0, rank);
    const rookTo = indexOf(move.castle === 'king' ? 5 : 3, rank);
    next.board[rookTo] = next.board[rookFrom];
    next.board[rookFrom] = null;
  }

  if (piece.toLowerCase() === 'k') {
    next.castling[color === 'w' ? 'K' : 'k'] = false;
    next.castling[color === 'w' ? 'Q' : 'q'] = false;
  }
  if (move.from === 0 || move.to === 0) next.castling.Q = false;
  if (move.from === 7 || move.to === 7) next.castling.K = false;
  if (move.from === 56 || move.to === 56) next.castling.q = false;
  if (move.from === 63 || move.to === 63) next.castling.k = false;

  next.enPassant = move.doublePawn ? (move.from + move.to) / 2 : null;
  next.halfmove = piece.toLowerCase() === 'p' || capturedPiece ? 0 : current.halfmove + 1;
  if (color === 'b') next.fullmove += 1;
  next.turn = color === 'w' ? 'b' : 'w';
  return next;
}

function legalMoves(current, color = current.turn) {
  return pseudoMoves(current, color).filter((move) => {
    const next = applyMove(current, move);
    return !isInCheck(next, color);
  });
}

function isInsufficientMaterial(current) {
  const pieces = current.board.filter((piece) => piece && piece.toLowerCase() !== 'k');
  if (pieces.some((piece) => ['p', 'r', 'q'].includes(piece.toLowerCase()))) return false;
  if (pieces.length <= 1) return true;
  if (pieces.every((piece) => piece.toLowerCase() === 'b')) {
    const bishopSquares = current.board
      .map((piece, square) => piece && piece.toLowerCase() === 'b' ? (square % 8 + Math.floor(square / 8)) % 2 : null)
      .filter((squareColor) => squareColor !== null);
    return bishopSquares.every((squareColor) => squareColor === bishopSquares[0]);
  }
  return false;
}

function isThreefoldRepetition(history) {
  const currentKey = history[history.length - 1];
  return history.filter((key) => key === currentKey).length >= 3;
}

function terminalResult(current, history) {
  const moves = legalMoves(current);
  if (moves.length === 0) {
    if (!isInCheck(current)) {
      return {
        kind: 'draw',
        title: 'Пат — ничья',
        message: 'У игрока, чей ход, не осталось легальных ходов, но шаха нет. Партия завершилась вничью.',
      };
    }
    return current.turn === playerColor
      ? { kind: 'loss', title: 'Ты проиграл', message: 'Бот поставил мат. Попробуешь ещё раз?' }
      : { kind: 'win', title: 'Ты выиграл!', message: 'Отличная партия — ты поставил боту мат.' };
  }
  if (current.halfmove >= 100) {
    return { kind: 'draw', title: 'Ничья', message: 'Пятьдесят ходов прошли без взятия и хода пешкой.' };
  }
  if (isInsufficientMaterial(current)) {
    return { kind: 'draw', title: 'Ничья', message: 'На доске недостаточно фигур, чтобы поставить мат.' };
  }
  if (isThreefoldRepetition(history)) {
    return { kind: 'draw', title: 'Ничья', message: 'Одна и та же позиция повторилась трижды.' };
  }
  return null;
}

function evaluate(current) {
  let score = 0;
  for (let square = 0; square < 64; square += 1) {
    const piece = current.board[square];
    if (!piece) continue;
    const color = colorOf(piece);
    const type = piece.toLowerCase();
    const rank = Math.floor(square / 8);
    const file = square % 8;
    const advancement = color === 'w' ? rank : 7 - rank;
    const centerDistance = Math.abs(3.5 - file) + Math.abs(3.5 - rank);
    let positional = 0;
    if (type === 'p') positional = advancement * 8 + (3.5 - Math.abs(3.5 - file)) * 2;
    if (type === 'n' || type === 'b') positional = (7 - centerDistance) * 5;
    if (type === 'k' && current.fullmove > 20) positional = -centerDistance * 3;
    score += (color === 'w' ? 1 : -1) * (values[type] + positional);
  }
  return current.turn === 'w' ? score : -score;
}

function moveOrderScore(current, move) {
  const moving = current.board[move.from].toLowerCase();
  const captured = move.capture ? values[move.capture.toLowerCase()] : 0;
  const promotion = move.promotion ? values[move.promotion] : 0;
  return captured * 10 - values[moving] + promotion;
}

function search(current, depth, alpha, beta, ply = 0) {
  if (current.halfmove >= 100 || isInsufficientMaterial(current)) return 0;
  const moves = legalMoves(current);
  if (moves.length === 0) return isInCheck(current) ? -100000 + ply : 0;
  if (depth === 0) return evaluate(current);
  moves.sort((a, b) => moveOrderScore(current, b) - moveOrderScore(current, a));
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = -search(applyMove(current, move), depth - 1, -beta, -alpha, ply + 1);
    bestScore = Math.max(bestScore, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return bestScore;
}

function chooseBotMove() {
  const depth = Number(difficultySelect.value);
  const moves = legalMoves(position);
  moves.sort((a, b) => moveOrderScore(position, b) - moveOrderScore(position, a));
  let bestScore = -Infinity;
  let bestMoves = [];
  for (const move of moves) {
    const score = -search(applyMove(position, move), depth - 1, -Infinity, Infinity, 1);
    if (score > bestScore) {
      bestScore = score;
      bestMoves = [move];
    } else if (score === bestScore) {
      bestMoves.push(move);
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] || null;
}

function moveNotation(current, move, nextPosition) {
  if (move.castle) return move.castle === 'king' ? 'O-O' : 'O-O-O';
  const piece = current.board[move.from];
  const type = piece.toLowerCase();
  const capture = Boolean(move.capture);
  let notation = type === 'p' ? (capture ? files[move.from % 8] : '') : piece.toUpperCase();
  if (capture) notation += 'x';
  notation += squareName(move.to);
  if (move.promotion) notation += `=${move.promotion.toUpperCase()}`;
  if (isInCheck(nextPosition)) notation += legalMoves(nextPosition).length === 0 ? '#' : '+';
  return notation;
}

function saveUndoPoint() {
  undoStack.push({
    position: clonePosition(position),
    lastMove: lastMove ? { ...lastMove } : null,
    playedMoves: playedMoves.map((move) => ({ ...move })),
    positionHistory: positionHistory.slice(),
  });
}

function commitMove(move) {
  const movingPiece = position.board[move.from];
  saveUndoPoint();
  const notation = moveNotation(position, move, applyMove(position, move));
  position = applyMove(position, move);
  lastMove = { from: move.from, to: move.to };
  positionHistory.push(positionKey(position));
  const record = playedMoves[playedMoves.length - 1];
  if (position.turn === 'b') {
    playedMoves.push({ white: notation, black: '' });
  } else if (record) {
    record.black = notation;
  }
  selectedSquare = null;
  selectedMoves = [];
  const result = terminalResult(position, positionHistory);
  let delayedResult = null;
  if (result) {
    gameOver = true;
    setStatus(result.title.toLocaleUpperCase('ru'), true);
    if (result.kind === 'loss' && colorOf(movingPiece) !== playerColor) {
      delayedResult = result;
    } else {
      showResult(result);
    }
  }
  render();
  animateMove(move, movingPiece, delayedResult ? () => {
    resultTimeout = window.setTimeout(() => {
      resultTimeout = null;
      showResult(delayedResult);
    }, 2000);
  } : null);
}

function requestBotMove() {
  if (gameOver || position.turn === playerColor) return;
  botThinking = true;
  setStatus('БОТ ДУМАЕТ', false, true);
  thinkingLabel.textContent = 'ДУМАЕТ…';
  undoButton.disabled = true;
  botMoveTimeout = window.setTimeout(() => {
    botMoveTimeout = null;
    if (!botThinking || gameOver || position.turn === playerColor) return;
    const move = chooseBotMove();
    botThinking = false;
    thinkingLabel.textContent = '';
    if (move) commitMove(move);
    if (!gameOver) {
      const checked = isInCheck(position);
      setStatus(checked ? 'ШАХ — ТВОЙ ХОД' : 'ТВОЙ ХОД', false);
    }
  }, 420);
}

function animateMove(move, movingPiece, onComplete = null) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onComplete?.();
    return;
  }

  const animations = [];
  const arrivingPieces = [];
  const piecesToAnimate = [{
    from: move.from,
    to: move.to,
    piece: move.promotion ? (movingPiece === 'P' ? move.promotion.toUpperCase() : move.promotion) : movingPiece,
  }];
  if (move.castle) {
    const rank = movingPiece === 'K' ? 0 : 7;
    piecesToAnimate.push({
      from: indexOf(move.castle === 'king' ? 7 : 0, rank),
      to: indexOf(move.castle === 'king' ? 5 : 3, rank),
      piece: movingPiece === 'K' ? 'R' : 'r',
    });
  }

  for (const pieceMove of piecesToAnimate) {
    const origin = boardElement.querySelector(`[data-square="${pieceMove.from}"]`);
    const destination = boardElement.querySelector(`[data-square="${pieceMove.to}"]`);
    const targetPiece = destination?.querySelector('.piece');
    if (!origin || !destination || !targetPiece) continue;

    const originRect = origin.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    const flight = document.createElement('span');
    flight.className = `piece piece-flight ${colorOf(pieceMove.piece) === 'w' ? 'white' : 'black'}`;
    flight.setAttribute('aria-hidden', 'true');
    flight.textContent = symbols[pieceMove.piece];
    flight.style.left = `${originRect.left}px`;
    flight.style.top = `${originRect.top}px`;
    flight.style.width = `${originRect.width}px`;
    flight.style.height = `${originRect.height}px`;
    flight.style.fontSize = getComputedStyle(targetPiece).fontSize;
    document.body.append(flight);
    targetPiece.classList.add('piece-arriving');
    arrivingPieces.push(targetPiece);
    animations.push(flight.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${destinationRect.left - originRect.left}px, ${destinationRect.top - originRect.top}px)` },
      ],
      { duration: 360, easing: 'cubic-bezier(0.22, 0.75, 0.22, 1)', fill: 'forwards' },
    ));
  }

  if (animations.length === 0) {
    onComplete?.();
    return;
  }

  const animationGroup = { animations, arrivingPieces };
  activeMoveAnimation = animationGroup;
  undoButton.disabled = true;
  const finishAnimation = () => {
    if (activeMoveAnimation !== animationGroup) return;
    for (const animation of animations) animation.cancel();
    for (const piece of arrivingPieces) piece.classList.remove('piece-arriving');
    for (const animation of animations) animation.effect?.target?.remove();
    activeMoveAnimation = null;
    updateUndoButton();
    onComplete?.();
  };
  Promise.all(animations.map((animation) => animation.finished)).then(
    finishAnimation,
    () => {
      if (activeMoveAnimation === animationGroup) finishAnimation();
    },
  );
}

function cancelMoveAnimation() {
  if (!activeMoveAnimation) return;
  const { animations, arrivingPieces } = activeMoveAnimation;
  activeMoveAnimation = null;
  for (const animation of animations) {
    animation.cancel();
    animation.effect?.target?.remove();
  }
  for (const piece of arrivingPieces) piece.classList.remove('piece-arriving');
}

function setStatus(message, isOver = false, isThinking = false) {
  statusElement.textContent = message;
  statusDot.classList.toggle('is-over', isOver);
  statusDot.classList.toggle('is-thinking', isThinking);
  document.getElementById('turnPrompt').textContent = !gameStarted
    ? 'ГОТОВ К ИГРЕ'
    : isOver ? 'ПАРТИЯ ОКОНЧЕНА'
      : isThinking || position.turn !== playerColor ? 'ХОД БОТА' : 'ТВОЙ ХОД';
}

function showResult(result) {
  resultCard.className = `result-card is-${result.kind}`;
  resultTitle.textContent = result.title;
  resultMessage.textContent = result.message;
  resultIcon.textContent = result.kind === 'loss' ? '♟' : result.kind === 'win' ? '♔' : '½';
  resultDialog.hidden = false;
  document.getElementById('resultNewGameButton').focus();
}

function renderBoard() {
  const checkedKing = isInCheck(position) ? kingSquare(position, position.turn) : -1;
  const possibleTargets = new Set(selectedMoves.map((move) => move.to));
  const displayRanks = boardFlipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const displayFiles = boardFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  document.getElementById('boardFiles').replaceChildren(...displayFiles.map((file) => {
    const coordinate = document.createElement('span');
    coordinate.textContent = files[file];
    return coordinate;
  }));
  document.getElementById('boardRanks').replaceChildren(...displayRanks.map((rank) => {
    const coordinate = document.createElement('span');
    coordinate.textContent = String(rank + 1);
    return coordinate;
  }));
  boardElement.innerHTML = '';
  boardElement.setAttribute('aria-label', `Шахматная доска, снизу ${boardFlipped ? 'чёрные' : 'белые'}`);
  for (const rank of displayRanks) {
    for (const file of displayFiles) {
      const square = indexOf(file, rank);
      const piece = position.board[square];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `square ${(file + rank) % 2 === 0 ? 'light' : 'dark'}`;
      button.dataset.square = String(square);
      button.setAttribute('role', 'gridcell');
      button.setAttribute('aria-label', `${squareName(square)}${piece ? `, ${pieceName(piece)}` : ''}`);
      button.setAttribute('aria-selected', String(selectedSquare === square));
      if (selectedSquare === square) button.classList.add('selected');
      if (checkedKing === square) button.classList.add('in-check');
      if (lastMove && (lastMove.from === square || lastMove.to === square)) button.classList.add('last-move');
      if (piece) {
        const pieceElement = document.createElement('span');
        pieceElement.className = `piece ${colorOf(piece) === 'w' ? 'white' : 'black'}`;
        pieceElement.setAttribute('aria-hidden', 'true');
        pieceElement.textContent = symbols[piece];
        button.append(pieceElement);
      }
      if (possibleTargets.has(square)) {
        const marker = document.createElement('span');
        marker.className = piece ? 'capture-ring' : 'move-dot';
        marker.setAttribute('aria-hidden', 'true');
        button.append(marker);
      }
      boardElement.append(button);
    }
  }
}

function pieceName(piece) {
  const names = { k: 'король', q: 'ферзь', r: 'ладья', b: 'слон', n: 'конь', p: 'пешка' };
  return `${colorOf(piece) === 'w' ? 'белые' : 'чёрные'}: ${names[piece.toLowerCase()]}`;
}

function renderMoves() {
  const completedMoves = playedMoves.length;
  moveCountElement.textContent = `${completedMoves} ${completedMoves === 1 ? 'ход' : completedMoves >= 2 && completedMoves <= 4 ? 'хода' : 'ходов'}`;
  if (playedMoves.length === 0) {
    moveListElement.innerHTML = '<li class="empty-moves">Здесь появятся твои ходы</li>';
    return;
  }
  moveListElement.innerHTML = playedMoves.map((move, index) => `
    <li class="move-row">
      <span class="move-number">${index + 1}.</span>
      <span class="move-cell ${index === playedMoves.length - 1 && !move.black ? 'latest' : ''}">${move.white}</span>
      <span class="move-cell ${index === playedMoves.length - 1 && move.black ? 'latest' : ''}">${move.black}</span>
    </li>
  `).join('');
  moveListElement.scrollTop = moveListElement.scrollHeight;
}

function render() {
  renderBoard();
  renderMoves();
  updateUndoButton();
  positionLabel.textContent = gameOver ? 'Партия завершена' : position.fullmove === 1 && position.turn === 'w' ? 'Начальная позиция' : `Ход ${position.fullmove}`;
  document.getElementById('playerTurnIndicator').style.visibility = gameStarted && position.turn === playerColor && !gameOver ? 'visible' : 'hidden';
  botDifficultyLabel.textContent = difficultyNames[difficultySelect.value];
  const playerIsWhite = playerColor === 'w';
  document.getElementById('playerColorLabel').textContent = `Играешь ${playerIsWhite ? 'белыми' : 'чёрными'}`;
  document.getElementById('playerAvatar').textContent = playerIsWhite ? symbols.P : symbols.p;
  document.getElementById('playerAvatar').classList.toggle('is-black', !playerIsWhite);
  document.getElementById('botAvatar').textContent = playerIsWhite ? symbols.p : symbols.P;
  document.getElementById('botAvatar').classList.toggle('is-black', playerIsWhite);
  document.getElementById('gameTag').textContent = playerIsWhite ? 'БЕЛЫМИ' : 'ЧЁРНЫМИ';
  document.getElementById('newGameButtonLabel').textContent = gameStarted ? 'Новая партия' : 'Начать игру';
  document.querySelector('#newGameButton [aria-hidden="true"]').textContent = gameStarted ? '↻' : '▶';
  const rotateButton = document.getElementById('rotateBoardButton');
  rotateButton.setAttribute('aria-pressed', String(boardFlipped));
  rotateButton.disabled = activeMoveAnimation !== null;
}

function updateUndoButton() {
  const botOpeningNotPlayed = playerColor === 'b' && playedMoves.length === 1 && !playedMoves[0].black;
  undoButton.disabled = !gameStarted || gameOver || undoStack.length === 0 || botThinking || activeMoveAnimation !== null || botOpeningNotPlayed;
}

function selectSquare(square) {
  if (!gameStarted || gameOver || botThinking || activeMoveAnimation || position.turn !== playerColor) return;
  const piece = position.board[square];
  if (selectedSquare !== null && selectedSquare === square) {
    selectedSquare = null;
    selectedMoves = [];
    render();
    return;
  }
  if (selectedSquare !== null) {
    const matchingMoves = selectedMoves.filter((move) => move.to === square);
    if (matchingMoves.length > 0) {
      if (matchingMoves.some((move) => move.promotion)) {
        showPromotionDialog(matchingMoves);
      } else {
        commitMove(matchingMoves[0]);
        if (!gameOver) requestBotMove();
      }
      return;
    }
  }
  if (piece && colorOf(piece) === playerColor) {
    selectedSquare = square;
    selectedMoves = legalMoves(position).filter((move) => move.from === square);
  } else {
    selectedSquare = null;
    selectedMoves = [];
  }
  render();
}

function showPromotionDialog(moves) {
  promotionOptions.innerHTML = '';
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const move = moves.find((candidate) => candidate.promotion === promotion);
    if (!move) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'promotion-choice';
    button.textContent = symbols[promotion.toUpperCase()];
    button.setAttribute('aria-label', `Превратить пешку в ${pieceName(promotion.toUpperCase())}`);
    button.addEventListener('click', () => {
      promotionDialog.hidden = true;
      commitMove(move);
      if (!gameOver) requestBotMove();
    });
    promotionOptions.append(button);
  }
  promotionDialog.hidden = false;
  promotionOptions.querySelector('button')?.focus();
}

function undoTurn() {
  const botOpeningNotPlayed = playerColor === 'b' && playedMoves.length === 1 && !playedMoves[0].black;
  if (!undoStack.length || botThinking || botOpeningNotPlayed) return;
  do {
    const snapshot = undoStack.pop();
    position = snapshot.position;
    lastMove = snapshot.lastMove;
    playedMoves = snapshot.playedMoves;
    positionHistory = snapshot.positionHistory;
  } while (position.turn !== playerColor && undoStack.length > 0);
  selectedSquare = null;
  selectedMoves = [];
  gameOver = false;
  resultDialog.hidden = true;
  setStatus(position.turn === playerColor ? 'ТВОЙ ХОД' : 'ХОД БОТА');
  render();
}

function prepareGame(startImmediately) {
  cancelMoveAnimation();
  window.clearTimeout(botMoveTimeout);
  botMoveTimeout = null;
  window.clearTimeout(resultTimeout);
  resultTimeout = null;
  playerColor = playerColorSelect.value;
  position = createInitialPosition();
  selectedSquare = null;
  selectedMoves = [];
  lastMove = null;
  gameOver = false;
  botThinking = false;
  gameStarted = startImmediately;
  playedMoves = [];
  positionHistory = [positionKey(position)];
  undoStack = [];
  promotionDialog.hidden = true;
  resultDialog.hidden = true;
  thinkingLabel.textContent = '';
  setStatus(!gameStarted ? 'ГОТОВ К ИГРЕ' : playerColor === 'w' ? 'ТВОЙ ХОД' : 'ХОД БОТА');
  render();
  if (gameStarted && position.turn !== playerColor) requestBotMove();
}

function startNewGame() {
  prepareGame(true);
}

function changePlayerColor() {
  boardFlipped = playerColorSelect.value === 'b';
  prepareGame(false);
}

boardElement.addEventListener('click', (event) => {
  const square = event.target.closest('[data-square]');
  if (square) selectSquare(Number(square.dataset.square));
});

document.getElementById('newGameButton').addEventListener('click', startNewGame);
document.getElementById('resultNewGameButton').addEventListener('click', startNewGame);
resultViewBoardButton.addEventListener('click', () => {
  resultDialog.hidden = true;
  boardElement.querySelector('[data-square]')?.focus();
});

undoButton.addEventListener('click', undoTurn);
difficultySelect.addEventListener('change', render);
playerColorSelect.addEventListener('change', changePlayerColor);
document.getElementById('rotateBoardButton').addEventListener('click', () => {
  if (activeMoveAnimation) return;
  boardFlipped = !boardFlipped;
  renderBoard();
  const rotateButton = document.getElementById('rotateBoardButton');
  rotateButton.setAttribute('aria-pressed', String(boardFlipped));
});
promotionDialog.addEventListener('click', (event) => {
  if (event.target === promotionDialog) {
    promotionDialog.hidden = true;
    selectedSquare = null;
    selectedMoves = [];
    setStatus('ГОТОВ К ИГРЕ');
    render();
  }
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !promotionDialog.hidden) {
    promotionDialog.hidden = true;
    selectedSquare = null;
    selectedMoves = [];
    render();
  }
});

setStatus('ГОТОВ К ИГРЕ');
render();
