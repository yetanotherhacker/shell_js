// TODO: figure out scoping weirdness with GLOBAL and this in node
shell = new (require('./shell.js'))();
testHash = {a: [ 1, [ 2 ], { b: [ 3, [ 4, 5 ] ] } ] };
allPass = true;
tests = {
    checkRefs: function() {
        return [4 == shell.reference('testHash.a[2].b[1][0]'), 'array and object referencing'];
    },
    mkdirLocal: function() {
        shell.cd('testHash.a[2]');
        shell.mkdir('testDir');
        return [2 == Object.keys(shell.reference('testHash.a[2]')).length, 'local scope mkdir()'];
    }
};

for (testName in tests) {
    result = tests[testName]();
    //result is equal to [didTestPass, test description]
    if (!result[0]) {
        allPass = false;
        console.log('fail', '-', testName, '-', result[1]);
    }
}

if (allPass) {
    console.log('All tests passed!');
}
