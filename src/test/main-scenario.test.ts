import { beforeEach, describe, expect, it } from "vitest";

import { createContact } from "@/app/actions";

import { countContacts, listContacts, signInTestUser } from "./as-user";
import { contactForm } from "./forms";

beforeEach(signInTestUser);

describe("Main scenario", () => {
  it("shows a contact in the list right after it is added", async () => {
    const result = await createContact(contactForm({ name: "Анна Смирнова" }));

    expect(result.ok).toBe(true);
    expect((await listContacts("")).map((contact) => contact.name)).toEqual(["Анна Смирнова"]);
    expect(await countContacts()).toBe(1);
  });
});
