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

        // Create increase button
        let increaseButton = new PopupMenu.PopupMenuItem('Increase');
        increaseButton.connect('activate', () => {
            counter++;
            this._label.set_text(`${counter}`);
        });

        // Create decrease button
        let decreaseButton = new PopupMenu.PopupMenuItem('Decrease');
        decreaseButton.connect('activate', () => {
            counter--;
            this._label.set_text(`${counter}`);
        });

        // Add buttons to the indicator's menu
        this._indicator.menu.addMenuItem(increaseButton);
        this._indicator.menu.addMenuItem(decreaseButton);

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
}

function init() {
    return new CounterExtension();
}

// Define self
const self = ExtensionUtils.getCurrentExtension();