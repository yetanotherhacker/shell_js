##Shell.js##
Shell.js: treat Javascript environments like a unix shell. GPL 3.0.

Paradigm: objects act like folders. So `Shell.cd(x.y)` will shift to `{current_object}.x.y` and `Shell.ls()` will give the contents of the current object. Using the `with()` keyword in appropriate places gives shell scripting functionality.

i.e.
```javascript
    with (Shell) {
        with(Shell.reference(Shell.path)) {
            mkdir('x');
            x.y = 4;
            x.z = 6;
            cd('x');
            ls();
        }
    }
```

-- `ls()` returns x and y

-- the entire 'script' runs in local scope

Functions implemented:
cd  cp  ls  mkdir   pwd reload  rm

Current quirks:

`cp()` assumes jQuery for its deep copy functionality when copying objects and acts like `cp -r`

`ls` only supports `-a` for now which is equivalent to `-A`.

`mkdir()` is extended to take advantage of Javascript's prototyping system - see the source for details

`pwd()` returns a reference to the current path. `Shell.path` returns the path in `String` form

`reference()` passes the last valid object encountered in the path