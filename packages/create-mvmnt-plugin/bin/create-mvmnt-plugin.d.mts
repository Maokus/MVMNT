export interface PromptOptions {
    name?: string;
    dir?: string;
    element?: string;
    elementName?: string;
    template?: string;
}

export interface PromptQuestion {
    type: string | null;
    name: string;
    message: string;
    initial: string | number | ((previous: unknown, values: Record<string, string>) => string);
    validate?: (value: string) => true | string;
    choices?: Array<{ title: string; description: string; value: string }>;
}

export function toTitleCase(value: string): string;
export function createPromptQuestions(options: PromptOptions): PromptQuestion[];
export function addPromptQuestions(options: PromptOptions): PromptQuestion[];
export function renderElementTemplate(
    source: string,
    values: { ELEMENT_TYPE: string; ELEMENT_NAME: string; ELEMENT_DESCRIPTION: string },
    label?: string
): string;
