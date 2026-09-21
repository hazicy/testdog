import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

const response = await client.systemOne({
  state: { document: "3232" },
  questions: {
    category: choice("What is the category of this document?", {}),
  },
});
