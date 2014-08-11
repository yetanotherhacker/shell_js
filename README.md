##Shell.js##
Shell.js: treat Javascript environments like a unix shell. GPL 3.0.

Paradigm: objects act like folders. So given `foo = new Shell()`, `foo.cd(x.y)` will shift to `{current_object}.x.y` and `foo.ls()` will give the contents of the current object. Using the `with()` keyword in appropriate places gives Shell scripting functionality.

i.e.
```javascript
	foo = new Shell();
    with (foo) {
        with(foo.reference(foo.path)) {
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

-- `local-tests.js` has more tests

Functions implemented:
cd  cp  ls  mkdir   pwd reload  rm

Current quirks:

`cp()` assumes jQuery for its deep copy functionality when copying objects and acts like `cp -r`

`ls` only supports `-a` for now which is equivalent to `-A`.

`mkdir()` supports prototypes as a second parameter

`pwd()` returns a reference to the current path. `pwd(true)` returns the path in `String` form

`reference()` passes the last valid object encountered in the path
