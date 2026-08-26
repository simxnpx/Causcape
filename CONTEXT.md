# Causcape

Causcape combines an engineering canvas and a structured explanation into a single project that people and agents can navigate and change together.

## Language

**Project**:
A self-contained engineering representation with one infinite canvas, one document, project-local canvas objects, and the references between them.
_Avoid_: Artifact, workspace

**Canvas Object**:
Any shape, arrow, text, frame, image, or drawing on a project's canvas. Every canvas object has a stable identity and may have a name and metadata.
_Avoid_: Component

**Named Canvas Object**:
A canvas object whose stored name allows the document to reference it independently of its visible appearance.
_Avoid_: Promoted component, semantic component

**Document**:
The project's structured written explanation, composed of editable blocks and inline references to canvas objects.
_Avoid_: Description, report

**Canvas Reference**:
A structured inline document token that identifies a canvas object by stable identity and displays its current name or an intentional wording override.
_Avoid_: Tag, hyperlink, name match

**Deleted Object Reference**:
A canvas reference whose target was deleted and which remains in the document as an explicit placeholder until restored or replaced.
_Avoid_: Broken link

**Focus Mode**:
The project view in which the canvas occupies the full viewport and retains the complete drawing experience.
_Avoid_: Editor mode

**Briefing Mode**:
The project view in which a smaller sticky canvas remains above the scrolling document.
_Avoid_: Split view, side-by-side view

**Prepared Engineering Shape**:
A technology-neutral engineering shape assembled from existing drawing primitives and presented as one selectable canvas object.
_Avoid_: New primitive, component type

**Project Patch**:
An atomic proposal to create or modify canvas objects, document blocks, references, metadata, or layout within a project.
_Avoid_: Agent action

**Project Revision**:
The monotonically changing project version against which a project patch is validated to prevent stale updates.
_Avoid_: File version
