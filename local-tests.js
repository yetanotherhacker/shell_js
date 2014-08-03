// TODO: figure out scoping weirdness with GLOBAL and this in node
shell = new (require('./shell.js'))();
testHash = {a: [ 1, [ 2 ], { b: [ 3, [ 4, 5 ] ] } ] };
allPass = true;
tests = {
    checkRefs: function() {
        shell.cd('');
        return [4 == shell.reference('testHash.a[2].b[1][0]'), 'array and object referencing'];
    },
    mkdirLocal: function() {
        shell.cd('');
        shell.cd('testHash.a[2]');
        shell.mkdir('testDir');
        return [2 == Object.keys(shell.reference('testHash.a[2]')).length, 'local scope mkdir()'];
    },
    mkdirScoping: function() {
        var passTest = true;
        shell.cd('');
        shell.mkdir('testHashA');
        passTest &= !Object.keys(testHashA).length;
        shell.mkdir('testHashB');
        passTest &= !Object.keys(testHashB).length;
        shell.mkdir('testHashA.c');
        passTest &= Object.keys(testHashA).length == 1;
        shell.cd('testHashA');
        shell.mkdir('d');
        passTest &= Object.keys(testHashA).length == 2;
        shell.mkdir('d.e');
        passTest &= Object.keys(testHashA.d).length == 1;
        shell.mkdir('testHashB.d');
        passTest &= Object.keys(testHashB).length == 1;
        shell.mkdir('testHashB.d.e');
        passTest &= Object.keys(testHashB.d).length == 1;
        shell.cd('');
        shell.rm('testHashA');
        shell.rm('testHashB');
        return [passTest, 'global and local scoping for mkdir()'];
    },
    globalMakeRemove: function() {
        var isDirMade, isDirRemoved;
        shell.cd('');
        shell.mkdir('emptyTestHash');
        isDirMade = GLOBAL['emptyTestHash'] && !Object.keys(emptyTestHash).length;
        shell.rm('emptyTestHash');
        isDirRemoved = !GLOBAL['emptyTestHash'];
        return [isDirMade && isDirRemoved, 'global make and remove object'];
    },
    lsOpts: function() {
        var zeroOpt = shell.ls().length,
            singleOpt = shell.ls('', '-a').length,
            doubleOpt = shell.ls('', '--all').length;

        return [(singleOpt === doubleOpt) && (singleOpt > zeroOpt), 'ls opts work'];
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
