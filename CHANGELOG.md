# bases-card-wrap

## 1.0.3

### Patch Changes

- 4821bc2: The plugin no longer keeps a closed cards view or a closed popout window in memory. A theme or font change now resets the scrollbars of the wrap boxes in a popout window too.

## 1.0.2

### Patch Changes

- 05c5357: The Vault default setting now shows how to get Pro, with a Sponsor on GitHub button, when you select it without Pro. The rules for each view stay free.

## 1.0.1

### Patch Changes

- The rule window lists each rule of a property that is not on the cards, for example after a rename of the property, with a button to delete it. The layout check runs again when you select another view in the same tab, and each view waits 500 ms after its own first miss before the check pauses it. A styled view with no cards no longer makes other cards views scan on each scroll. The wrap box no longer shows a scrollbar and hides the last line when the value fits, also after a change of the line count or the pane width. A box of N lines holds N full lines of text.
