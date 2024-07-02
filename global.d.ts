export { };

declare global {
    interface Element {
        getBoxQuads(element: HTMLElement, options?: { box: 'margin' | 'border' | 'padding' | 'content', relativeTo: Element })
    }
}