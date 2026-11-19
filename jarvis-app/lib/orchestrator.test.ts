import assert from "node:assert/strict";
import test from "node:test";
import { analyzeOrchestratorInput, selectRelevantMemory } from "./orchestrator";

test("single natural request is classified into multiple relevant intents", () => {
  const result = analyzeOrchestratorInput(
    "Ich habe nächste Woche zwei Klausuren und möchte dreimal trainieren.",
    new Date("2026-11-19T10:00:00Z"),
  );
  assert.ok(result.intents.includes("learning"));
  assert.ok(result.intents.includes("fitness"));
  assert.ok(result.intents.includes("weekly_planning"));
  assert.ok(result.tools.includes("get_weekly_plan"));
});

test("presentation deadline becomes a deterministic task action", () => {
  const result = analyzeOrchestratorInput(
    "Ich muss bis Freitag meine Präsentation fertigstellen.",
    new Date("2026-11-18T10:00:00Z"),
  );
  assert.ok(result.intents.includes("task"));
  assert.ok(result.intents.includes("learning"));
  const action = result.actions.find((item) => item.type === "add_task");
  assert.equal(action?.type, "add_task");
  if (action?.type === "add_task") {
    assert.equal(action.due, "2026-11-20");
    assert.equal(action.priority, "normal");
  }
});

test("training statement is routed to fitness logging", () => {
  const result = analyzeOrchestratorInput("Ich habe heute Brust und Rücken trainiert.");
  assert.ok(result.intents.includes("fitness"));
  assert.ok(result.tools.includes("log_gym"));
  assert.ok(result.actions.some((action) => action.type === "log_gym"));
});

test("calendar information is routed to an event and inferred date", () => {
  const result = analyzeOrchestratorInput(
    "Ich habe morgen um 16 Uhr Training.",
    new Date("2026-11-19T10:00:00Z"),
  );
  assert.ok(result.intents.includes("calendar"));
  assert.ok(result.tools.includes("add_event"));
  const event = result.actions.find((action) => action.type === "add_event");
  assert.equal(event?.type, "add_event");
  if (event?.type === "add_event") {
    assert.equal(event.day, "2026-11-20");
    assert.equal(event.time, "16:00");
  }
});

test("ambiguous date asks exactly one clarification", () => {
  const result = analyzeOrchestratorInput("Ich muss am 25.10. meine Präsentation abgeben.");
  assert.equal(result.shouldAskClarification, true);
  assert.equal(result.actions.filter((action) => action.type === "clarify").length, 1);
});

test("approval is required for destructive and external actions", () => {
  for (const text of [
    "Lösche meine wichtigen Daten.",
    "Bitte sage meinen Termin morgen ab.",
    "Überweise 100 Euro.",
  ]) {
    const result = analyzeOrchestratorInput(text);
    assert.equal(result.shouldRequireApproval, true);
  }
});

test("memory retrieval prioritizes facts relevant to the request", () => {
  const facts = [
    { text: "Youssef mag Tee." },
    { text: "Nächste Prüfung ist Mathematik." },
    { text: "Trainingsziel sind vier Einheiten pro Woche." },
  ];
  assert.deepEqual(
    selectRelevantMemory(facts, "Wann ist meine Matheprüfung?", 2).map((fact) => fact.text),
    ["Nächste Prüfung ist Mathematik.", "Youssef mag Tee."],
  );
});

test("day planning request creates learning, calendar and fitness actions", () => {
  const result = analyzeOrchestratorInput(
    "Plane morgen meinen Tag. Ich habe um 16 Uhr Fußball, muss Englisch lernen und will ins Fitnessstudio.",
    new Date("2026-11-19T10:00:00Z"),
  );
  assert.ok(result.intents.includes("learning"));
  assert.ok(result.intents.includes("fitness"));
  assert.ok(result.intents.includes("calendar"));
  assert.ok(result.intents.includes("daily_planning"));
  assert.ok(result.actions.some((action) => action.type === "add_task"));
  assert.ok(result.actions.some((action) => action.type === "add_event"));
  assert.ok(result.actions.some((action) => action.type === "generate_daily_plan"));
});
