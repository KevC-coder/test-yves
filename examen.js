"use strict";

const get = (id) => document.getElementById(id);
const letters = ["A", "B", "C", "D"];
const storageKey = "arte-republicano-xix/examen-v2";
const total = 25;
const bankIds = QUESTIONS.map((_, index) => index);
const mobile = window.matchMedia("(max-width: 680px)");

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function newAttempt(previous) {
  let pool = previous?.remaining ?? shuffle(bankIds);
  if (pool.length === 0) {
    // Keep the last attempt out of the first draw in the new cycle.
    const lastIds = new Set(previous.ids);
    const firstDraw = shuffle(bankIds.filter((id) => !lastIds.has(id))).slice(0, total);
    const drawnIds = new Set(firstDraw);
    pool = [...firstDraw, ...shuffle(bankIds.filter((id) => !drawnIds.has(id)))];
  }
  return {
    ids: pool.slice(0, total),
    remaining: pool.slice(total),
    current: 0,
    answers: Array(total).fill(null),
    evaluated: false,
  };
}

function validSelection(saved) {
  if (!Array.isArray(saved.ids) || saved.ids.length !== total ||
      !Array.isArray(saved.remaining) || saved.remaining.length % total !== 0) {
    return false;
  }
  const ids = [...saved.ids, ...saved.remaining];
  return ids.length <= bankIds.length && new Set(ids).size === ids.length &&
    ids.every((id) => Number.isInteger(id) && id >= 0 && id < bankIds.length);
}

function loadAttempt() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && validSelection(saved) && Number.isInteger(saved.current) && saved.current >= 0 &&
        saved.current < total && typeof saved.evaluated === "boolean" &&
        Array.isArray(saved.answers) && saved.answers.length === total &&
        saved.answers.every((value) => value === null ||
          (Number.isInteger(value) && value >= 0 && value < letters.length))) {
      return saved;
    }
  } catch {
    // The current attempt remains usable when browser storage is unavailable.
  }
  return newAttempt();
}

let attempt = loadAttempt();

function saveAttempt() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(attempt));
  } catch {
    // Keep the current attempt in memory.
  }
}

function element(tag, content, className = "") {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
}

function focusSection(id) {
  const heading = get(id);
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: "nearest" });
}

const jumpButtons = Array.from({ length: total }, (_, index) => {
  const button = element("button", index + 1, "jump");
  button.type = "button";
  button.addEventListener("click", () => {
    if (mobile.matches) get("navigation").open = false;
    goTo(index);
  });
  return button;
});
get("nav-grid").replaceChildren(...jumpButtons);
get("navigation").open = !mobile.matches;

function updateProgress() {
  const answered = attempt.answers.filter((answer) => answer !== null).length;
  get("progress").max = total;
  get("progress").value = answered;
  get("nav-count").textContent = `${answered} / ${total}`;
  get("nav-count").setAttribute("aria-label", `${answered} de ${total} respondidas`);
  jumpButtons.forEach((button, index) => {
    const done = attempt.answers[index] !== null;
    button.classList.toggle("answered", done);
    button.setAttribute("aria-label", `Pregunta ${index + 1}, ${done ? "respondida" : "pendiente"}`);
    if (index === attempt.current) {
      button.setAttribute("aria-current", "step");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function renderQuestion() {
  const question = QUESTIONS[attempt.ids[attempt.current]];
  get("exam").hidden = false;
  get("results").hidden = true;
  get("confirm").hidden = true;
  get("question-number").textContent = `Pregunta ${attempt.current + 1} de ${total}`;
  get("topic").textContent = question.topic;
  get("question-title").textContent = question.question;
  const options = get("options");
  options.setAttribute("aria-labelledby", "question-title");
  options.replaceChildren(...question.options.map((text, index) => {
    const label = element("label", "", "option");
    const letter = element("span", letters[index], "letter");
    letter.setAttribute("aria-hidden", "true");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = index;
    input.checked = attempt.answers[attempt.current] === index;
    input.addEventListener("change", () => {
      attempt.answers[attempt.current] = index;
      get("confirm").hidden = true;
      saveAttempt();
      updateProgress();
    });
    label.append(letter, element("span", text), input);
    return label;
  }));
  const last = attempt.current === total - 1;
  get("previous").disabled = attempt.current === 0;
  get("next").hidden = last;
  get("evaluate").hidden = !last;
  updateProgress();
}

function goTo(index) {
  if (attempt.evaluated || index < 0 || index >= total) return;
  attempt.current = index;
  saveAttempt();
  renderQuestion();
  focusSection("question-title");
}

function evaluate() {
  attempt.evaluated = true;
  saveAttempt();
  renderResults();
  focusSection("result-title");
}

function requestEvaluation() {
  const pending = attempt.answers.filter((answer) => answer === null).length;
  if (pending === 0) {
    evaluate();
    return;
  }
  get("confirm-text").textContent = pending === 1
    ? "Queda 1 pregunta sin responder. ¿Quieres evaluar el examen ahora?"
    : `Quedan ${pending} preguntas sin responder. ¿Quieres evaluar el examen ahora?`;
  get("confirm").hidden = false;
  focusSection("confirm-text");
}

function resultOf(index) {
  const answer = attempt.answers[index];
  if (answer === null) return "pending";
  return answer === QUESTIONS[attempt.ids[index]].correct ? "correct" : "wrong";
}

function answerLine(label, question, index, className = "") {
  const line = element("p", "", className);
  line.append(element("strong", label), " ", index === null
    ? "Sin responder"
    : `${letters[index]}. ${question.options[index]}`);
  return line;
}

function renderReview() {
  const filter = get("filter").value;
  const items = [];
  attempt.ids.forEach((id, index) => {
    const question = QUESTIONS[id];
    const result = resultOf(index);
    const correct = result === "correct";
    if ((filter === "correct" && !correct) || (filter === "missed" && correct)) return;
    const item = element("li", "", "review-item");
    item.value = index + 1;
    const status = correct ? "Correcta" : result === "pending" ? "Sin responder" : "Incorrecta";
    item.append(
      element("p", `Pregunta ${index + 1} · ${status}`, correct ? "status ok" : "status"),
      element("h3", question.question),
      answerLine("Tu respuesta", question, attempt.answers[index]),
      answerLine("Respuesta correcta", question, question.correct, "right"),
      element("p", question.why, "why"),
    );
    items.push(item);
  });
  get("review").replaceChildren(...items);
  get("empty-review").hidden = items.length > 0;
}

function renderResults() {
  get("exam").hidden = true;
  get("results").hidden = false;
  const outcomes = attempt.ids.map((_, index) => resultOf(index));
  const correct = outcomes.filter((result) => result === "correct").length;
  const wrong = outcomes.filter((result) => result === "wrong").length;
  const pending = total - correct - wrong;
  get("score").textContent = `${correct} / ${total} · ${Math.round(correct / total * 100)} %`;
  get("breakdown").textContent = `${correct} correctas · ${wrong} incorrectas · ${pending} sin responder`;
  renderReview();
}

get("previous").addEventListener("click", () => goTo(attempt.current - 1));
get("next").addEventListener("click", () => goTo(attempt.current + 1));
get("evaluate").addEventListener("click", requestEvaluation);
get("confirm-evaluate").addEventListener("click", evaluate);
get("complete").addEventListener("click", () => goTo(attempt.answers.indexOf(null)));
get("filter").addEventListener("change", renderReview);
get("restart").addEventListener("click", () => {
  attempt = newAttempt(attempt);
  get("filter").value = "all";
  saveAttempt();
  renderQuestion();
  focusSection("question-title");
});

saveAttempt();
if (attempt.evaluated) renderResults();
else renderQuestion();
