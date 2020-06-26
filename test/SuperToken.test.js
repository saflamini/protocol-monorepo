const { expectRevert } = require("@openzeppelin/test-helpers");

const {
    web3tx,
    toWad,
    toBN
} = require("@decentral.ee/web3-helpers");

const traveler = require("ganache-time-traveler");

const Tester = require("./Tester");

const ADV_TIME = 2;
const FLOW_RATE = toWad(1);

contract("Super Token", accounts => {

    const tester = new Tester(accounts.slice(0, 4));
    const { alice, bob, carol } = tester.aliases;
    const { INIT_BALANCE } = tester.constants;

    let token;
    let superToken;
    let flowAgreement;

    before(async () => {
        tester.printAliases();
    });

    beforeEach(async function () {
        await tester.resetContracts();
        ({
            token,
            superToken,
            flowAgreement
        } = tester.contracts);
    });

    describe("#0 SuperToken ERC20 info", () => {
        it("#0.1 - test basic token info", async () => {
            assert.equal(await superToken.name.call(), "SuperTestToken");
            assert.equal(await superToken.symbol.call(), "STT");
            assert.equal(await superToken.decimals.call(), 18);
        });
    });

    describe("#1 SuperToken.upgrade", () => {
        it("#1.1 - should upgrade if enough balance", async () => {
            const initialBalance = await token.balanceOf.call(alice);

            await web3tx(superToken.upgrade, "SuperToken.upgrade 2.0 tokens from alice") (
                toWad(2), {
                    from: alice
                });
            const { timestamp } = await web3.eth.getBlock("latest");

            const finalBalance = await token.balanceOf.call(alice);
            const finalSuperTokenBalance = await superToken.balanceOf.call(alice);
            const finalRealBalance = await superToken.realtimeBalanceOf.call(alice, timestamp);

            assert.equal(finalSuperTokenBalance.toString(), toWad(2).toString(),
                "SuperToken.balanceOf is wrong");
            assert.equal(initialBalance.sub(finalBalance).toString(), toWad(2).toString(),
                "SuperToken.upgrade should manage underlying tokens");
            assert.ok(finalRealBalance.eq(finalSuperTokenBalance),
                "balanceOf should equal realtimeBalanceOf");

            await tester.validateSystem();
        });

        it("#1.2 - should not upgrade without enough underlying balance", async() => {
            const initialBalance = await token.balanceOf.call(alice);
            await expectRevert(web3tx(superToken.upgrade, "SuperToken.upgrade - bad balance")(
                initialBalance.add(toBN(1)), {from: alice}), "ERC20: transfer amount exceeds balance");
            await tester.validateSystem();
        });
    });

    describe("#2 SuperToken.downgrade", () => {
        it("#2.1 - should downgrade by single account", async() => {
            const initialBalance = await token.balanceOf.call(alice);

            await web3tx(superToken.upgrade, "SuperToken.upgrade 2 from alice") (
                toWad(2), {
                    from: alice
                });

            await web3tx(superToken.downgrade, "SuperToken.downgrade 2 from alice") (
                toWad(1), {
                    from: alice
                });

            const finalBalance = await token.balanceOf.call(alice);
            const finalSuperTokenBalance = await superToken.balanceOf.call(alice);

            assert.isOk(initialBalance.sub(finalBalance).toString(), toWad(1),
                "TestToken.balanceOf should recover after downgrade");
            assert.equal(finalSuperTokenBalance.toString(), toWad("1"),
                "SuperToken.balanceOf is wrong");

            await tester.validateSystem();
        });

        it("#2.2 - should downgrade by multiple accounts", async () => {
            const initialBalanceAlice = await token.balanceOf.call(alice);
            const initialSuperBalanceAlice = await superToken.balanceOf.call(alice);

            await web3tx(superToken.upgrade, "upgrade 2 from alice")(toWad(2), {from: alice});
            await web3tx(superToken.upgrade, "upgrade 1 from bob")(toWad(1), {from: bob});

            const initialSuperBalanceBob = await superToken.balanceOf.call(bob);

            await web3tx(superToken.downgrade, "downgrade 2 from alice") (
                toWad(2), {
                    from: alice
                });

            const finalBalanceAlice = await token.balanceOf.call(alice);
            const finalSuperBalanceAlice = await superToken.balanceOf.call(alice);
            const finalSuperBalanceBob = await superToken.balanceOf.call(bob);

            assert.equal(
                initialBalanceAlice.toString(),
                finalBalanceAlice.toString(),
                "TestToken.balanceOf - not correct for alice");
            assert.equal(
                initialSuperBalanceAlice.toString(),
                finalSuperBalanceAlice.toString(),
                "SuperToken.balanceOf - not correct for user 1");
            assert.equal(
                initialSuperBalanceBob.toString(),
                finalSuperBalanceBob.toString(),
                "SuperToken.balanceOf - not correct for user 2");

            await tester.validateSystem();
        });

        it("#2.3 - should not downgrade if there is no balance", async () => {
            await expectRevert(web3tx(superToken.downgrade, "SuperToken.downgrade - bad balance")(
                toBN(1), {
                    from: alice
                }), "SuperToken: downgrade amount exceeds balance");
        });
    });

    describe("#3 SuperToken ISuperAgreementStorage(TBD) operations", () => {
        // TODO To be improved with a mock agreement class

        it("#3.1 - should track active agreement classes", async() => {
            await web3tx(
                flowAgreement.updateFlow,
                "FlowAgreement.updateFlow alice bob 1x"
            )(superToken.address, alice, bob, FLOW_RATE, {from: alice});
            let aliceAgreementClasses = await superToken.getAccountActiveAgreements.call(alice);
            let bobAgreementClasses = await superToken.getAccountActiveAgreements.call(bob);
            let carolAgreementClasses = await superToken.getAccountActiveAgreements.call(carol);

            assert.ok(aliceAgreementClasses.length == 1);
            assert.ok(bobAgreementClasses.length == 1);
            assert.ok(carolAgreementClasses.length == 0);
            assert.equal(aliceAgreementClasses[0], flowAgreement.address);
            assert.equal(bobAgreementClasses[0], flowAgreement.address);

            await web3tx(
                flowAgreement.updateFlow,
                "FlowAgreement.updateFlow bob carol 2x"
            )(superToken.address, bob, carol, FLOW_RATE.mul(toBN(2)), {from: bob});

            aliceAgreementClasses = await superToken.getAccountActiveAgreements.call(alice);
            bobAgreementClasses = await superToken.getAccountActiveAgreements.call(bob);
            carolAgreementClasses = await superToken.getAccountActiveAgreements.call(carol);
            assert.ok(aliceAgreementClasses.length == 1);
            assert.ok(bobAgreementClasses.length == 1);
            assert.ok(carolAgreementClasses.length == 1);
            assert.equal(aliceAgreementClasses[0], flowAgreement.address);
            assert.equal(bobAgreementClasses[0], flowAgreement.address);
            assert.equal(carolAgreementClasses[0], flowAgreement.address);

            await web3tx(
                flowAgreement.deleteFlow,
                "FlowAgreement.deleteFlow alice bob"
            )(superToken.address, alice, bob, {from: alice});
            aliceAgreementClasses = await superToken.getAccountActiveAgreements.call(alice);
            bobAgreementClasses = await superToken.getAccountActiveAgreements.call(bob);

            aliceAgreementClasses = await superToken.getAccountActiveAgreements.call(alice);
            bobAgreementClasses = await superToken.getAccountActiveAgreements.call(bob);
            carolAgreementClasses = await superToken.getAccountActiveAgreements.call(carol);
            assert.ok(aliceAgreementClasses.length == 0);
            assert.ok(bobAgreementClasses.length == 1);
            assert.ok(carolAgreementClasses.length == 1);
            assert.equal(bobAgreementClasses[0], flowAgreement.address);
            assert.equal(carolAgreementClasses[0], flowAgreement.address);

            await tester.validateSystem();
        });

        it("#3.2 - should only be updated by authorized agreement", async () => {
            await expectRevert(
                web3tx(superToken.updateAgreementAccountState,
                    "SuperToken.updateAgreementAccountState by alice directly")(
                    alice,
                    "0x42", {from: alice}
                ), "SuperToken: unauthorized agreement storage access");
        });
    });

    describe("#4 SuperToken.transfer", () => {
        it("#4.1 - should transfer available amount", async() => {
            await web3tx(superToken.upgrade, "SuperToken.upgrade 2 from alice") (
                toWad(2), {
                    from: alice
                });
            await web3tx(superToken.transfer, "SuperToken.transfer 2 from alice to bob") (
                bob, toWad(0.5), {
                    from: alice
                });

            const finalSuperBalanceAlice = await superToken.balanceOf.call(alice);
            const finalSuperBalanceBob = await superToken.balanceOf.call(bob);

            assert.equal(finalSuperBalanceAlice.toString(), toWad(1.5));
            assert.equal(finalSuperBalanceBob.toString(), toWad(0.5));

            await tester.validateSystem();
        });

        it("#4.2 - should not transfer unavailable balance", async() => {
            await web3tx(superToken.upgrade, "upgrade 2 from alice") (
                toWad(2), {
                    from: alice
                });
            await expectRevert(
                web3tx(superToken.transfer, "transfer 2(+1wei) from alice to bob should fail")(
                    bob, toWad(2).add(toBN(1)), {from: alice}
                ), "transfer amount exceeds balance");
            await tester.validateSystem();
        });

        it("#4.3 - should be able to transfer flow balance", async() => {
            await web3tx(superToken.upgrade, "upgrade all from alice")(
                INIT_BALANCE, {from: alice});

            await web3tx(flowAgreement.updateFlow, "updateFlow alice to bob")(
                superToken.address, alice, bob, FLOW_RATE, {from: alice});
            await traveler.advanceTimeAndBlock(ADV_TIME);

            const superBalanceBob = await superToken.balanceOf.call(bob);
            await web3tx(superToken.transfer, "downgrade all interim balance from bob to carol")(
                carol, superBalanceBob, {from: bob});

            const superBalanceCarol = await superToken.balanceOf.call(carol);
            assert.equal(superBalanceCarol.toString(), superBalanceBob.toString());

            await tester.validateSystem();
        });
    });

    describe("#5 SuperToken.approve", () => {
        it("#5.1 - should approve amount", async() => {
            await web3tx(superToken.upgrade, "upgrade all from alice")(
                INIT_BALANCE, {from: alice});
            const aliceSuperBalance = await superToken.balanceOf.call(alice);
            await web3tx(superToken.approve, "approve bob all alice balance")(
                bob, aliceSuperBalance, {from: alice});

            const fullAllowedBalanceBob = await superToken.allowance.call(alice, bob);
            assert.equal(aliceSuperBalance.toString(),
                fullAllowedBalanceBob.toString(),
                "Bob allowance is not alice full balance"
            );

            await web3tx(superToken.approve, "approve bob half of alice balance")(
                bob, aliceSuperBalance.div(toBN(2)), {from: alice});
            const halfAllowedBalanceBob = await superToken.allowance.call(alice, bob);
            assert.equal(aliceSuperBalance.div(toBN(2)).toString(),
                halfAllowedBalanceBob.toString(),
                "Bob allowance is not alice half balance"
            );

            await web3tx(superToken.approve, "unapprove bob")(
                bob, 0, {from: alice});
            const finalAllowedBalanceBob = await superToken.allowance.call(alice, bob);
            assert.equal(finalAllowedBalanceBob.toString(), 0, "bob final allowance should be zero");
        });

        it("#5.2 - should transfer approved amount reducing allowance amount", async() => {
            await web3tx(superToken.upgrade, "upgrade all from alice")(
                INIT_BALANCE, {from: alice});
            const aliceSuperBalance = await superToken.balanceOf.call(alice);
            await web3tx(superToken.approve, "approve bob all alice balance")(
                bob, aliceSuperBalance, {from: alice});

            await superToken.transferFrom(alice, bob, aliceSuperBalance, {from: bob});
            const superBalanceBob = await superToken.balanceOf.call(bob);
            assert.equal(superBalanceBob.toString(),
                aliceSuperBalance.toString(),
                "bob didn't received all amount of alice"
            );

            await expectRevert(
                web3tx(superToken.transferFrom,
                    "SuperToken.transferFrom without allowance")(
                    alice,
                    bob,
                    1, {from: bob}
                ), "transfer amount exceeds balance");
        });
    });

});