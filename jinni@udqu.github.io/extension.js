const { St, Clutter, Gio, GLib } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;

// Define self for this extension
const self = ExtensionUtils.getCurrentExtension();

// Main extension object
class CounterExtension {
    constructor() {
        this._indicator = null;
        this._settings = null;
        this._widthChangedHandler = null;
        this._entry = null;
        this._listBox = null;
        this._counter = 0;
        // current edit variables
        this._currentEntry = null;
        this._currentLabel = null;
        this._currentIndex = null;
        this._entryFocusOutHandlerId = null;
    }

    enable() {
        // Load the CSS file
        this._loadStylesheet();

        // Retrieve settings
        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.jinni');
        // Create a new panel indicator
        this._indicator = new PanelMenu.Button(0.0, "Counter Indicator", false);

        // Add CSS class to the indicator for custom styling
        this._indicator.add_style_class_name('counter-indicator');

        // Create a label for displaying the counter value
        this._label = new St.Label({
            text: `${this._counter}`,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // Add CSS class to the label for custom styling
        this._label.add_style_class_name('counter-label');

        // Add the label to the indicator
        this._indicator.add_child(this._label);

        // Create the text box (entry)
        this._entry = new St.Entry({
            can_focus: true,
            hint_text: "Type your task here and hit enter",
            style_class: 'counter-entry'
        });

        // Connect the key press event
        this._entry.clutter_text.connect('activate', this._onTextEntered.bind(this));

        // Create a box to hold the list of recorded texts
        this._listBox = new St.BoxLayout({
            vertical: true,
            style_class: 'counter-list'
        });

        // Create a container for the text box and list inside a PopupMenu.PopupMenuSection
        let container = new PopupMenu.PopupMenuSection();
        container.actor.add_child(this._entry);
        container.actor.add_child(this._listBox);

        // Add the container to the indicator's menu
        this._indicator.menu.addMenuItem(container);

        // Add the indicator to the status area (panel)
        Main.panel.addToStatusArea('counter-indicator', this._indicator);

        // Connect to the settings change signal
        this._widthChangedHandler = this._settings.connect('changed::tasklist-window-width', this._updateWidth.bind(this));
        this._updateWidth();  // Initialize with current value

        // Connect the button press event to focus on the text entry box
        this._indicator.connect('button_press_event', this._onIndicatorClicked.bind(this));
    }

    disable() {
        if (this._indicator !== null) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._settings && this._widthChangedHandler) {
            this._settings.disconnect(this._widthChangedHandler);
            this._widthChangedHandler = null;
        }
        if (this._entryFocusOutHandlerId) {
            global.stage.disconnect(this._entryFocusOutHandlerId);
            this._entryFocusOutHandlerId = null;
        }
    }

    _updateWidth() {
        let taskListWindowWidth = this._settings.get_int('tasklist-window-width');
        // Set the width of the task list window
        this._indicator.menu.actor.width = taskListWindowWidth;
    }

    _loadStylesheet() {
        try {
            // Ensure the stylesheet is loaded
            let themeContext = St.ThemeContext.get_for_stage(global.stage);
            let stylesheet = Gio.File.new_for_path(`${self.path}/stylesheet.css`);

            // Add the stylesheet to the theme context
            themeContext.get_theme().load_stylesheet(stylesheet);
        } catch (error) {
            log(`Failed to load stylesheet: ${error.message}`);
        }
    }

    _onIndicatorClicked(actor, event) {
        // Check if the click event is a left-click (button 1)
        if (event.get_button() === Clutter.BUTTON_PRIMARY) {
            // Focus on the text entry box
            this._entry.grab_key_focus();
        }
    }

    _onTextEntered() {
        let text = this._entry.get_text().trim();
        if (text !== "") {
            // Create a label for the entered text and add to the list
            let textLabel = new St.Label({
                text: text,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'counter-list-item'
            });

            // Make the label reactive to clicks
            textLabel.reactive = true;

            let clickCount = 0; // Track click count

            // Connect button-release-event to handle single and double clicks
            textLabel.connect('button-release-event', (actor, event) => {
                if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                    clickCount++;

                    // Handle single click
                    if (clickCount === 1) {
                        // Check if there's already an entry being edited
                        if (this._currentEntry) {
                            this._saveCurrentEntry();
                        }
                    }

                    // Handle double-click
                    if (clickCount === 2) {
                        this._editTask(textLabel);
                    }

                    // Reset click count after a timeout
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                        clickCount = 0;
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });

            this._listBox.add_child(textLabel);

            // Clear the entry text
            this._entry.set_text("");

            // Increment the counter and update the label
            this._counter++;
            this._label.set_text(`${this._counter}`);
        }
    }

    _editTask(label) {
        // Check if there's already an entry being edited
        if (this._currentEntry) {
            this._saveCurrentEntry();
        }

        // Get the index of the current label
        let index = this._listBox.get_children().indexOf(label);

        // On double-click, replace the label with an entry
        let entry = new St.Entry({
            can_focus: true,
            text: label.get_text(), // Set entry text to current label text
            style_class: 'counter-entry'
        });

        // Replace label with entry
        this._listBox.remove_child(label);
        this._listBox.insert_child_at_index(entry, index);

        // Store the current entry and corresponding label
        this._currentEntry = entry;
        this._currentLabel = label;
        this._currentIndex = index;

        // Connect activation event to save changes
        entry.clutter_text.connect('activate', () => {
            this._saveCurrentEntry();
        });

        // Listen for global pointer events to detect focus loss
        this._entryFocusOutHandlerId = global.stage.connect('captured-event', this._handleFocusLoss.bind(this));

        // Focus entry
        entry.grab_key_focus();
        entry.clutter_text.set_selection(0, -1);
    }

    _handleFocusLoss(actor, event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            let target = event.get_source();
            if (target !== this._currentEntry && !this._currentEntry.contains(target)) {
                this._saveCurrentEntry();
            }
        }
    }

    _saveCurrentEntry() {
        if (!this._currentEntry) return;

        let newText = this._currentEntry.get_text().trim();
        if (newText !== "") {
            // Update label text with new text
            this._currentLabel.set_text(newText);
        }

        // Remove entry and add label back to the list at the same index
        this._listBox.remove_child(this._currentEntry);
        this._listBox.insert_child_at_index(this._currentLabel, this._currentIndex);

        // Disconnect the event listener for focus loss
        if (this._entryFocusOutHandlerId) {
            global.stage.disconnect(this._entryFocusOutHandlerId);
            this._entryFocusOutHandlerId = null;
        }

        // Clear the current entry and label references
        this._currentEntry = null;
        this._currentLabel = null;
        this._currentIndex = null;
    }
}

function init() {
    return new CounterExtension();
}