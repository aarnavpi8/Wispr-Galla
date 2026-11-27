import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "@/lib/locales/en";

import { AuthProvider } from "./auth";
import { LanguageProvider } from "./language";
import { SetupScreen } from "./SetupScreen";

function mockServer() {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/config") return Response.json({ llm_configured: false, wispr_configured: false, firebase: null });
      posts.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      return Response.json({ id: 1, name: "x", kind: "kirana", items: 10 }, { status: 201 });
    }),
  );
  return posts;
}

function renderSetup(onDone = vi.fn()) {
  localStorage.setItem("galla.lang", "en");
  render(
    <LanguageProvider>
      <AuthProvider>
        <SetupScreen onDone={onDone} />
      </AuthProvider>
    </LanguageProvider>,
  );
  return onDone;
}

beforeEach(() => localStorage.clear());

describe("SetupScreen", () => {
  it("asks name -> what you sell -> payments, then creates the shop", async () => {
    const posts = mockServer();
    const user = userEvent.setup();
    const onDone = renderSetup();

    const next = screen.getByRole("button", { name: `${en.next} →` });
    expect(next).toBeDisabled(); // a name is required
    await user.type(screen.getByLabelText(en.setupName), "Verma Medicals");
    await user.click(next);

    expect(screen.getByText(en.setupStep.replace("{i}", "2").replace("{n}", "3"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${en.next} →` })).toBeDisabled(); // pick a type
    await user.click(screen.getByRole("radio", { name: new RegExp(en.typeMedical) }));
    await user.click(screen.getByRole("button", { name: `${en.next} →` }));

    await user.type(screen.getByPlaceholderText(en.setupUpiPh), "verma@upi");
    await user.type(screen.getByPlaceholderText("0"), "1,500");
    await user.click(screen.getByRole("button", { name: `${en.setupStart} ✓` }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(posts).toEqual([
      {
        url: "/api/setup",
        body: { name: "Verma Medicals", kind: "medical", vpa: "verma@upi", language: "en", opening_cash: 1500, starter_items: true },
      },
    ]);
  });

  it("can go back and change an answer", async () => {
    mockServer();
    const user = userEvent.setup();
    renderSetup();
    await user.type(screen.getByLabelText(en.setupName), "A");
    await user.click(screen.getByRole("button", { name: `${en.next} →` }));
    await user.click(screen.getByRole("button", { name: en.tourBack }));
    expect(screen.getByLabelText(en.setupName)).toHaveValue("A");
  });

  it("'other' shops skip starter items", async () => {
    const posts = mockServer();
    const user = userEvent.setup();
    renderSetup();
    await user.type(screen.getByLabelText(en.setupName), "Hardware Hub");
    await user.click(screen.getByRole("button", { name: `${en.next} →` }));
    await user.click(screen.getByRole("radio", { name: new RegExp(en.typeOther) }));
    await user.click(screen.getByRole("button", { name: `${en.next} →` }));
    expect(screen.queryByText(en.setupStarter)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `${en.setupStart} ✓` }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({ kind: "other", starter_items: false, opening_cash: 0, vpa: "" });
  });

  it("judges can load the demo shop in one tap", async () => {
    const posts = mockServer();
    const user = userEvent.setup();
    const onDone = renderSetup();
    await user.click(screen.getByRole("button", { name: en.setupDemo }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(posts[0].url).toBe("/api/setup/demo");
  });
});
