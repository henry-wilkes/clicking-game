# Clicking Game Demo

A little clicking game demo.

Note this only works well visually and with a mouse (on desktop) since the game
responds to the mouse's positions.

## Running

The game is written in plain modern JavaScript, CSS and HTML. As such, the game
has no special dependencies and can be opened directly in the browser. In
particular, you just need to open the `main.html` file locally in a browser,
with the `main.css` and `main.js` files in the same directory. It is known to
work in Firefox.

Note: the demo is relatively CPU heavy for a web app since it applies lots of
re-positioning and CSS animations.

## What happens

When the user moves the mouse towards the button it will try to move away from
the mouse. If the user moves faster toward the button, it will move away faster.

If you try scrolling or zoom the mouse into the button's area it will similarly
try to move away.

The button will also bounce off the walls of its container, as well as the mouse
itself. It will eventually slow to a stop and become shiny again.

It is not impossible to click the button (using the border's corners helps), and
if you do it will turn red and rush away. But just bouncing the button around
can be fun by itself.
