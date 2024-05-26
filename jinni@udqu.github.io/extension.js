const { St, Clutter, Gio } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;

// Global variables that can be modified in any function
let counter = 0;

class CounterExtension {
    constructor() {
        this._indicator = null;
        this._settings = null;
        this._widthChangedHandler = null;
        this._entry = null;
        this._listBox = null;
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
            text: `${counter}`,
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

    _onTextEntered() {
        let text = this._entry.get_text().trim();
        if (text !== "") {
            // Create a label for the entered text and add to the list
            let textLabel = new St.Label({
                text: text,
                y_align: Clutter.ActorAlign.CENTER,
                style_class: 'counter-list-item'
            });

            this._listBox.add(textLabel);

            // Clear the entry text
            this._entry.set_text("");

            // Increment the counter and update the label
            counter++;
            this._label.set_text(`${counter}`);
        }
    }
}

function init() {
    return new CounterExtension();
}

// Define self
const self = ExtensionUtils.getCurrentExtension();