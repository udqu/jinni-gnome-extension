const { Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

function init() {}

function buildPrefsWidget() {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.jinni');

    // Add option for window size adjustment setting
    let widget = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20,
        spacing: 10
    });

    // Task List Window Width Setting
    let widthHbox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10
    });

    let widthLabel = new Gtk.Label({
        label: "Task List Window Width (pixels)",
        hexpand: true,
        halign: Gtk.Align.START
    });
    widthHbox.append(widthLabel);

    let widthEntry = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
            lower: 50,
            upper: 500,
            step_increment: 10
        }),
        value: settings.get_int('tasklist-window-width'),
        numeric: true,
        halign: Gtk.Align.END,
        width_request: 140
    });
    widthEntry.connect('value-changed', (entry) => {
        settings.set_int('tasklist-window-width', entry.value);
    });

    // Add an expanding box to push the spin button to the end
    let widthExpandBox = new Gtk.Box({ hexpand: true });
    widthHbox.append(widthExpandBox);
    widthHbox.append(widthEntry);
    widget.append(widthHbox);

    // Add some space between the settings
    let spacer = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        height_request: 5
    });
    widget.append(spacer);

    // Persist Tasks Setting
    let hbox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 10
    });

    let persistLabel = new Gtk.Label({
        label: "Persist tasks across sessions",
        hexpand: true,
        halign: Gtk.Align.START
    });
    hbox.append(persistLabel);

    let persistSwitch = new Gtk.Switch({
        active: settings.get_boolean('persist-tasks'),
        halign: Gtk.Align.END
    });
    persistSwitch.connect('notify::active', (sw) => {
        settings.set_boolean('persist-tasks', sw.active);
    });

    // Add an expanding box to push the switch to the end
    let expandBox = new Gtk.Box({ hexpand: true });
    hbox.append(expandBox);
    hbox.append(persistSwitch);
    widget.append(hbox);

    return widget;
}
