import { describe, expect, it } from "vitest";

import { BACK_TO_LIST, CONTACT_DELETED, failureMessage } from "@/lib/action-messages";

describe("Action messages", () => {
  it("name what failed, and do not blame the database", () => {
    expect(failureMessage("сохранить заметку")).toBe("Не удалось сохранить заметку. Попробуйте ещё раз.");
    expect(failureMessage("сохранить")).not.toContain("база данных");
  });

  it("tell that the contact is gone and where to go", () => {
    expect(CONTACT_DELETED).toBe("Этот контакт уже удалён");
    expect(BACK_TO_LIST).toBe("К списку контактов");
  });
});
